import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { scoutStatus } from "../api";
import { authFetch } from "../auth";
import { ScoutMessage } from "../components/ScoutMessage";
import { detectLang } from "../lang";
import { LogoMark } from "../components/Logo";
import { Sprout } from "../components/Sprout";

const SUGGESTIONS: { icon: "grid" | "cal" | "chart" | "soil"; text: string }[] = [
  { icon: "grid", text: "What should I plant next year on my rain-fed field near ZIP 50010?" },
  { icon: "chart", text: "Has rainfall or summer heat changed significantly near Garden City, KS (ZIP 67846) since 1991?" },
  { icon: "soil", text: "Pull the soil profile and crop history for 42.03, -93.62" },
  { icon: "cal", text: "Which rotations have farmers been recommended most this month?" },
];

const QUICK_ACTIONS = [
  { label: "Analyze a field by ZIP", prompt: "Analyze my field at ZIP " },
  { label: "Compare climate trends", prompt: "Compare the climate trends since 1991 for ZIP " },
  { label: "Explain the crop assumptions", prompt: "Show me the crop catalog: yields, prices, costs and nitrogen for each crop." },
  { label: "Usage analytics", prompt: "Give me an analytics summary of plans generated in the last 30 days." },
];

function Icon({ name }: { name: string }) {
  switch (name) {
    case "grid":
      return (
        <svg viewBox="0 0 24 24" className="ic ic-blue" aria-hidden="true">
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="8" rx="2" />
          <rect x="3" y="13" width="8" height="8" rx="2" />
          <rect x="13" y="13" width="8" height="8" rx="2" />
        </svg>
      );
    case "cal":
      return (
        <svg viewBox="0 0 24 24" className="ic ic-violet" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "chart":
      return (
        <svg viewBox="0 0 24 24" className="ic ic-gold" aria-hidden="true">
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className="ic ic-green" aria-hidden="true">
          <path d="M12 21c-5-3-8-7-8-11a8 8 0 0116 0c0 4-3 8-8 11z" />
          <path d="M12 7v7M9 11l3 3 3-3" />
        </svg>
      );
  }
}

/** Server errors arrive as raw response text (often JSON); show just the message. */
function errorText(err: Error): string {
  try {
    const j = JSON.parse(err.message) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* not JSON */
  }
  return err.message || "Sprout ran into a problem.";
}

type SpeechRec = {
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  lang: string;
  interimResults: boolean;
};

interface Props {
  chatId: string;
  initialMessages: UIMessage[];
  onMessages: (id: string, messages: UIMessage[]) => void;
  onMenu: () => void;
}

export function ScoutPage({ chatId, initialMessages, onMessages, onMenu }: Props) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/scout/chat", fetch: authFetch }), []);
  const { messages, sendMessage, status, error, stop, regenerate, clearError } = useChat({ id: chatId, messages: initialMessages, transport });
  const [input, setInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [model, setModel] = useState<Awaited<ReturnType<typeof scoutStatus>> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // True while the user is at (or near) the bottom; streaming only auto-scrolls in that case,
  // so scrolling up to read earlier text is never yanked back down.
  const pinned = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);

  const busy = status === "submitted" || status === "streaming";
  const empty = messages.length === 0;

  useEffect(() => {
    scoutStatus().then(setModel).catch(() => setModel(null));
    inputRef.current?.focus();
  }, []);

  // Persist when a turn starts and when it settles (not on every streamed token).
  const lastSaved = useRef("");
  useEffect(() => {
    if (status === "streaming") return;
    const sig = `${messages.length}:${status}`;
    if (sig === lastSaved.current) return;
    lastSaved.current = sig;
    onMessages(chatId, messages);
  }, [messages, status, chatId, onMessages]);

  const toBottom = (smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    pinned.current = atBottom;
    setShowJump(!atBottom);
  };

  // Follow the content as it grows (tokens, tool steps, sources) — instantly, no smooth animation
  // per token, which is what made the view jitter.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const ro = new ResizeObserver(() => {
      if (pinned.current) toBottom();
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [empty]);

  // Opening a saved chat starts at the latest message.
  useEffect(() => {
    toBottom();
  }, [empty]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    clearError();
    pinned.current = true;
    setShowJump(false);
    requestAnimationFrame(() => toBottom(true));
    setInput("");
    setMenuOpen(false);
    void sendMessage({ text: q });
  };

  const toggleMic = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.onresult = (e) => setInput(Array.from(e.results).map((r) => r[0]?.transcript ?? "").join(""));
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };
  const micSupported = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const composer = (
    <form
      className="sc-composer"
      onSubmit={(e) => {
        e.preventDefault();
        send(input);
      }}
    >
      <div className="sc-plus-wrap">
        <button type="button" className="sc-icon-btn" aria-label="Quick actions" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        {menuOpen && (
          <ul className="sc-menu" role="menu">
            {QUICK_ACTIONS.map((a) => (
              <li key={a.label}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    if (a.prompt.endsWith(" ")) {
                      setInput(a.prompt);
                      inputRef.current?.focus();
                    } else send(a.prompt);
                  }}
                >
                  {a.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <textarea
        ref={inputRef}
        rows={1}
        value={input}
        placeholder="Ask Sprout about your field"
        aria-label="Message Sprout"
        maxLength={4000}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send(input);
          }
        }}
      />
      <span className="sc-model" title={model?.fallback ? `Backup: ${model.fallback}` : "AI model"}>
        {model?.model ? (model.provider === "workers-ai" ? `Cloudflare Workers AI · ${model.model.replace(/^@cf\/[^/]+\//, "")}` : model.model) : "Sprout"}
      </span>
      {micSupported && (
        <button type="button" className={`sc-icon-btn ${listening ? "rec" : ""}`} aria-label={listening ? "Stop dictation" : "Dictate"} onClick={toggleMic}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0014 0M12 18v3" />
          </svg>
        </button>
      )}
      {busy ? (
        <button type="button" className="sc-send" aria-label="Stop" onClick={() => void stop()}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
          </svg>
        </button>
      ) : (
        <button type="submit" className="sc-send" aria-label="Send" disabled={!input.trim()}>
          {input.trim() ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 10v4M10 7v10M14 5v14M18 9v6" />
            </svg>
          )}
        </button>
      )}
    </form>
  );

  const last = messages[messages.length - 1];

  return (
    <div className="scout">
      <header className="sc-top">
        <button type="button" className="sc-icon-btn sc-menu-btn" aria-label="Open sidebar" onClick={onMenu}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <span className="sc-title">
          <LogoMark size={28} />
          Sprout
        </span>
        {model && !model.configured && <span className="sc-warn">AI model not set up</span>}
      </header>

      {model?.research === "unavailable" && <p className="sc-research-state" role="status">Research unavailable: retrieval bindings are not configured. No research citations can be verified until search is available.</p>}

      {empty ? (
        <div className="sc-hero">
          <Sprout mood="hello" width={128} />
          <h1>Hi, I'm Sprout. What's growing on your field?</h1>
          <p className="sc-lead">Ask about any US field. I read 35 years of NASA data so you don't have to.</p>
          {composer}
          <ul className="sc-suggest">
            {SUGGESTIONS.map((s) => (
              <li key={s.text}>
                <button type="button" onClick={() => send(s.text)}>
                  <Icon name={s.icon} />
                  <span>{s.text}</span>
                </button>
              </li>
            ))}
          </ul>
          {model && !model.configured && (
            <p className="sc-note">
              Sprout needs the Workers AI binding or a Gemini API key (<code>GEMINI_API_KEY</code> in <code>.dev.vars</code>). Restart the dev server after adding it.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="sc-scroll" ref={scrollRef} onScroll={onScroll}>
          <div className="sc-thread" ref={contentRef} aria-live="polite">
            {messages.map((m) =>
              m.role === "user" ? (
                <UserMessage key={m.id} text={m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")} />
              ) : (
                <ScoutMessage key={m.id} message={m} streaming={busy && m.id === last?.id} />
              ),
            )}
            {status === "submitted" && (
              <div className="sc-msg sc-bot sc-thinking">
                <Sprout mood="checking" width={40} decorative />
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
                <span className="sc-thinking-text">Sprout is checking the NASA data…</span>
              </div>
            )}
            {error && (
              <div className="sc-msg sc-bot sc-err">
                <p>{errorText(error)}</p>
                <button type="button" className="sc-retry" onClick={() => void regenerate()}>
                  Try again
                </button>
              </div>
            )}
          </div>
          </div>
          <div className="sc-dock">
            {showJump && (
              <button type="button" className="sc-jump" aria-label="Scroll to latest" onClick={() => { pinned.current = true; setShowJump(false); toBottom(true); }}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14M5 12l7 7 7-7" />
                </svg>
              </button>
            )}
            {composer}
            <p className="sc-disclaimer">Sprout can make mistakes. Check the numbers in your plan before acting on them.</p>
          </div>
        </>
      )}
    </div>
  );
}

/** The farmer's message, tagged with its language when it isn't English (WCAG 3.1.2). */
function UserMessage({ text }: { text: string }) {
  return (
    <div className="sc-msg sc-user" lang={detectLang(text)}>
      {text}
    </div>
  );
}
