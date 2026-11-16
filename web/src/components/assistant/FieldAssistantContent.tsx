import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { PlanResponse } from "../../../../src/shared/types";
import { FERTILIZER_SUGGESTION } from "../../../../src/engine/fertilizerProducts";
import { authFetch } from "../../auth";
import { cropName, useI18n } from "../../i18n";
import { ScoutMessage } from "../ScoutMessage";
import { Sprout } from "../Sprout";
import type { FieldAssistantPanelProps } from "./FieldAssistantPanel";
import "./field-assistant.css";

const SUGGESTIONS = ["Why is this rotation recommended?", "How does limited irrigation change the plan?", "What are the soil and climate limits here?", FERTILIZER_SUGGESTION] as const;
export function FieldAssistantContent({ context, sharedPlan, onClose, className = "" }: FieldAssistantPanelProps): JSX.Element {
  const { t, language } = useI18n();
  const [localPlan, setPlan] = useState<PlanResponse | null>(null);
  const plan = sharedPlan !== undefined ? sharedPlan : localPlan;
  const [loading, setLoading] = useState(!!context);
  const [planError, setPlanError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [input, setInput] = useState("");
  const [menu, setMenu] = useState(false);
  const [httpError, setHttpError] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [jump, setJump] = useState(false);
  const timestamps = useRef(new Map<string, string>());
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  // Scout accepts UI messages, not a context body. Enrich the outgoing user turn only;
  // server tools remain the source of truth, and displayed bubbles stay readable.
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/scout/chat",
    fetch: async (url, options) => { const res = await authFetch(url, options); setHttpError(res.ok ? 0 : res.status); return res; },
    prepareSendMessagesRequest: ({ messages, body }) => ({ body: { ...body, messages: messages.map((m, i) => i !== messages.length - 1 ? m : { ...m, parts: [...m.parts, { type: "text", text: `\n\nSelected location and client plan context (verify claims with data tools; field ids are memory lookup identifiers, not current measurements):\n${JSON.stringify({ location: context, request: plan?.request ?? null, plan: plan ? { generatedAt: plan.generatedAt, summary: plan.explanation.summary, facts: plan.facts, assumptions: plan.assumptions, topRotation: plan.plans[0]?.years.map(y => ({ year: y.year, crop: y.cropName })) } : null })}\nReply in ${language === "es" ? "Spanish" : "English"}.` }] }) } }),
  }), [context, plan, language]);
  const { messages, sendMessage, status, error, stop, clearError, setMessages, regenerate } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";
  const canSend = !!context && (sharedPlan === undefined || !!sharedPlan) && !loading && configured === true && !busy;
  useEffect(() => {
    const ctrl = new AbortController(); setStatusFailed(false);
    authFetch("/api/scout/status", { signal: ctrl.signal }).then(async res => {
      if (!res.ok) throw new Error("status unavailable");
      const body = await res.json() as { configured: boolean };
      if (!ctrl.signal.aborted) setConfigured(body.configured);
    }).catch(() => { if (!ctrl.signal.aborted) setStatusFailed(true); });
    return () => ctrl.abort();
  }, [attempt]);
  useEffect(() => {
    if (sharedPlan !== undefined) { setLoading(false); setPlanError(""); return; }
    if (!context) return;
    const ctrl = new AbortController(); setLoading(true); setPlanError("");
    // Do not use fetchPlan's global last-plan store: Explore must not replace the planner plan.
    authFetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
      body: JSON.stringify({ lat: context.lat, lon: context.lon, irrigated: false, priority: "balanced", language: language === "es" ? "es" : "en" }) })
      .then(async res => {
        const body = await res.json() as PlanResponse & { error?: string };
        if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
        if (!ctrl.signal.aborted) { setPlan(body); setLoadedAt(new Date().toISOString()); }
      }).catch(err => { if (!ctrl.signal.aborted) setPlanError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
    // Location changes remount this component. Translation helpers are unstable dependencies.
  }, [attempt, language, sharedPlan]);
  useEffect(() => () => { void stop(); }, [stop]);
  useEffect(() => {
    for (const m of messages) if (!timestamps.current.has(m.id)) timestamps.current.set(m.id, new Date().toISOString());
    const el = scrollRef.current; if (el && pinned.current && messages.length) el.scrollTop = el.scrollHeight;
  }, [messages, status, plan]);
  function send(value: string) {
    if (!value.trim() || !canSend) return;
    clearError(); setHttpError(0); setInput(""); pinned.current = true; setJump(false);
    void sendMessage({ text: value.trim() }); inputRef.current?.focus();
  }
  function clearChat() {
    void stop(); setMessages([]); clearError(); setHttpError(0); timestamps.current.clear(); setMenu(false); inputRef.current?.focus();
  }
  function time(iso: string | null | undefined) {
    return iso ? <time dateTime={iso}>{new Date(iso).toLocaleTimeString(language === "es" ? "es-US" : "en-US", { hour: "numeric", minute: "2-digit" })}</time> : null;
  }
  function messageTime(id: string) {
    let stamp = timestamps.current.get(id);
    if (!stamp) { stamp = new Date().toISOString(); timestamps.current.set(id, stamp); }
    return time(stamp);
  }
  let errorMessage = error?.message || "";
  try { errorMessage = (JSON.parse(errorMessage) as { error?: string }).error || errorMessage; } catch { /* SDK errors may be plain text. */ }
  if (httpError === 429) errorMessage = t("Too many messages. Wait a minute before trying again.");
  if (httpError === 503) errorMessage = t("AI is unavailable. Your rotation and plan facts are still available below.");
  return <aside className={`field-assistant ${className}`} aria-label={t("Sprout")}>
    <header className="fa-header"><Sprout mood="hello" width={38} decorative />
      <div><h2>{t("Sprout")}</h2><p>{t("Your AI field advisor")}</p></div>
      <details open={menu} className="fa-menu" onToggle={e => setMenu(e.currentTarget.open)} onKeyDown={e => { if (e.key === "Escape") { setMenu(false); menuRef.current?.focus(); } }}>
        <summary ref={menuRef} aria-label={t("Assistant options")}><span aria-hidden="true">•••</span></summary>
        <div><button type="button" onClick={clearChat}>{t("Clear chat")}</button><a href="#/scout">{t("Open full chat")}</a></div>
      </details>
      {onClose && <button type="button" className="fa-icon" onClick={onClose} aria-label={t("Close assistant")}>×</button>}
    </header>
    <div className="fa-scroll" ref={scrollRef} onScroll={e => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; setJump(!pinned.current); }}>
      <div className="fa-greeting"><Sprout mood={loading ? "checking" : "hello"} width={32} decorative /><div>
        <p>{!context ? t("Enter a ZIP code to load your field context.") : loading ? t("Loading a rain-fed, balanced plan for {location}…", { location: context.label }) : plan ? t("I've loaded a plan for {location}. What would you like to explore?", { location: context.label }) : t("Selected location: {location}", { location: context.label })}</p>{time(loadedAt)}
      </div></div>
      {planError && <div role="alert" className="fa-notice"><p>{t("Could not load the plan. Please try again.")}</p><details><summary>{t("Details")}</summary>{planError}</details><button type="button" onClick={() => setAttempt(n => n + 1)}>{t("Try again")}</button></div>}
      {context && <div role="status" className="fa-status">{configured === false ? t("AI is unavailable. Your rotation and plan facts are still available below.") : statusFailed ? t("Could not check AI availability. Try again.") : configured === null ? t("Checking AI availability…") : ""}{statusFailed && <button type="button" onClick={() => setAttempt(n => n + 1)}>{t("Try again")}</button>}</div>}
      {plan && <section className="fa-plan" aria-label={t("Top rotation")}><h3>{t("Top rotation")}</h3><p className="fa-defaults">{sharedPlan !== undefined ? `${plan.request.water ?? (plan.request.irrigated ? "full" : "rain")} · ${plan.request.priority}` : t("Rain-fed · Balanced priority · Model estimate, not a guarantee")}</p>
        <ol className="fa-rotation">{plan.plans[0]?.years.map(y => <li key={y.year} className={`fa-crop fa-crop-${y.crop}`}><small>{y.year}</small><strong>{cropName(y.crop, language)}</strong></li>)}</ol>
        <details><summary>{t("Plan facts and assumptions")}</summary><p>{plan.explanation.summary}</p><ul>{plan.facts.map((f, i) => <li key={i}>{f.text} <small>({f.source})</small></li>)}</ul><ul>{plan.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></details>
      </section>}
      <div className="fa-thread" role="log" aria-label={t("Conversation")} aria-live="polite" aria-relevant="additions text" aria-busy={busy}>
        {messages.map((m, i) => <div className={`fa-turn fa-${m.role}`} key={m.id}>
          {m.role === "user" ? <span className="fa-avatar" aria-label={t("You")}>◉</span> : <Sprout mood="hello" width={30} decorative />}
          <div className="fa-turn-content">{m.role === "user" ? <p className="fa-user-bubble">{m.parts.filter(p => p.type === "text").map(p => p.text).join("")}</p> : <ScoutMessage message={m} streaming={busy && i === messages.length - 1} />}{messageTime(m.id)}</div>
        </div>)}
        {status === "submitted" && <p role="status">{t("Sprout is checking the NASA data…")}</p>}
      </div>
      {error && <div role="alert" className="fa-notice"><p>{errorMessage}</p><button type="button" disabled={busy || httpError === 503} onClick={() => { clearError(); setHttpError(0); void regenerate(); }}>{t("Try again")}</button></div>}
      {context && !messages.length && <section className="fa-suggestions"><h3>{t("Try asking about")}</h3>{SUGGESTIONS.map(s => <button type="button" key={s} disabled={!canSend} onClick={() => send(t(s))}>{t(s)}<span aria-hidden="true"> ↗</span></button>)}</section>}
    </div>
    <footer className="fa-footer">{jump && <button type="button" className="fa-jump" onClick={() => { pinned.current = true; setJump(false); if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }}>{t("Scroll to latest")}</button>}
      <form className="fa-composer" onSubmit={e => { e.preventDefault(); send(input); }}>
        <textarea ref={inputRef} rows={2} maxLength={4000} value={input} disabled={!context || (sharedPlan !== undefined && !sharedPlan) || loading || configured !== true} aria-label={t("Ask a question about your fields…")} placeholder={t("Ask a question about your fields…")} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); } }} />
        {busy ? <button type="button" className="fa-send" aria-label={t("Stop")} onClick={() => void stop()}>■</button> : <button type="submit" className="fa-send" aria-label={t("Send")} disabled={!canSend || !input.trim()}>↑</button>}
      </form><p className="fa-disclaimer">{t("Sprout can make mistakes. Check the numbers in your plan before acting on them.")}</p>
    </footer>
  </aside>;
}
