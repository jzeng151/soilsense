import { useEffect, useMemo, useRef, useState } from "react";
import "./live.css";

// Live screen (#/live): watch a phone call to the SoilSense agent as it happens, for demos.
// Events come from the live-room Durable Object over a WebSocket; if that fails we poll every second.

interface LiveEvent {
  type: string;
  seq?: number;
  at?: number;
  call?: string;
  [k: string]: unknown;
}

const SOURCES: Record<string, { label: string; org: string }> = {
  county: { label: "Find the county", org: "FCC" },
  power: { label: "35 years of daily weather", org: "NASA POWER" },
  daymet: { label: "Second weather record", org: "NASA Daymet" },
  soil: { label: "Soil under the field", org: "USDA SSURGO" },
  cdl: { label: "What grew here, from space", org: "USDA Cropland Data Layer" },
  nass: { label: "County harvests and prices", org: "USDA NASS" },
  rma: { label: "Why crop insurance paid out", org: "USDA RMA" },
  openet: { label: "Water use measured by satellite", org: "OpenET (Landsat)" },
  engine: { label: "Replay every year on this soil", org: "SoilSense engine" },
  saved: { label: "Reused today's saved plan", org: "SoilSense cache" },
};
const SOURCE_ORDER = ["county", "power", "daymet", "soil", "cdl", "nass", "rma", "openet", "engine", "saved"];

const TOOLS: Record<string, string> = {
  find_location: "Find the field from the ZIP code",
  build_rotation_plan: "Build the 3-year plan",
  send_plan_by_text: "Text the plan to the caller",
  end_call: "End the call",
};

const WATER: Record<string, string> = { rain: "Rain only", limited: "Limited water", full: "Full irrigation" };

const ms = (n: unknown) => (typeof n === "number" ? (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`) : "");
const money = (n: unknown) => (typeof n === "number" ? `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n))}` : "–");
const time = (at: unknown) => (typeof at === "number" ? new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "");

type Step =
  | { kind: "say"; who: "caller" | "agent"; text: string; lang?: string; at?: number; interrupted?: boolean; seq: number }
  | { kind: "tool"; name: string; input?: unknown; ms?: number; ok?: boolean; waiting?: boolean; done: boolean; at?: number; seq: number; sources: Map<string, { ms?: number; ok?: boolean; prefetch?: boolean }> }
  | { kind: "prefetch"; seq: number }
  | { kind: "sms"; ok: boolean; to?: string; at?: number; seq: number }
  | { kind: "error"; at?: number; seq: number };

interface CallView {
  id: string;
  startedAt?: number;
  caller?: string | null;
  languages?: string[];
  ended: boolean;
  steps: Step[];
  prefetch: Map<string, { ms?: number; ok?: boolean }>;
  plan?: Record<string, unknown>;
  lastLang?: string;
}

/** Turn the event stream into calls, newest first. */
function buildCalls(events: LiveEvent[]): CallView[] {
  const calls = new Map<string, CallView>();
  const get = (id: string) => {
    let c = calls.get(id);
    if (!c) {
      c = { id, ended: false, steps: [], prefetch: new Map() };
      calls.set(id, c);
    }
    return c;
  };
  for (const e of events) {
    if (!e.call || typeof e.call !== "string") continue;
    const c = get(e.call);
    const seq = e.seq ?? 0;
    const openTool = () => [...c.steps].reverse().find((s): s is Extract<Step, { kind: "tool" }> => s.kind === "tool" && !s.done);
    switch (e.type) {
      case "call.start":
        c.startedAt = e.at;
        c.caller = (e.caller as string | null) ?? null;
        c.languages = e.languages as string[];
        break;
      case "call.say":
        if (e.who === "caller") c.lastLang = e.lang as string;
        if (typeof e.text === "string" && e.text.trim())
          c.steps.push({ kind: "say", who: e.who === "caller" ? "caller" : "agent", text: e.text, lang: e.lang as string, at: e.at, interrupted: Boolean(e.interrupted), seq });
        break;
      case "tool.start":
        c.steps.push({ kind: "tool", name: String(e.name), input: e.input, done: false, at: e.at, seq, sources: new Map() });
        break;
      case "tool.end": {
        const t = [...c.steps].reverse().find((s): s is Extract<Step, { kind: "tool" }> => s.kind === "tool" && s.name === e.name && !s.done);
        // "Ask the crop first" is the agent doing its job, not a failure.
        const err = (e.result as { error?: string } | undefined)?.error ?? "";
        if (t) Object.assign(t, { done: true, ms: e.ms, ok: e.ok, waiting: /^Do not build the plan yet/.test(err) });
        break;
      }
      case "source": {
        const src = String(e.source);
        if (e.prefetch) {
          if (!c.steps.some((s) => s.kind === "prefetch")) c.steps.push({ kind: "prefetch", seq });
          if (e.phase !== "start") c.prefetch.set(src, { ms: e.ms as number, ok: e.ok as boolean });
          else if (!c.prefetch.has(src)) c.prefetch.set(src, {});
          break;
        }
        const t = openTool();
        if (!t) break;
        if (e.phase === "start") {
          if (!t.sources.has(src)) t.sources.set(src, {});
        } else t.sources.set(src, { ms: e.ms as number, ok: e.ok as boolean });
        break;
      }
      case "plan":
        c.plan = e;
        break;
      case "sms":
        if (!e.ok) break; // the tool row already says it didn't work
        c.steps.push({ kind: "sms", ok: Boolean(e.ok), to: e.to as string, at: e.at, seq });
        break;
      case "error":
        c.steps.push({ kind: "error", at: e.at, seq });
        break;
      case "call.end":
        c.ended = true;
        break;
    }
  }
  return [...calls.values()].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
}

type Conn = "connecting" | "live" | "polling" | "off" | "unavailable";

function useLiveEvents() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [conn, setConn] = useState<Conn>("connecting");
  const [phone, setPhone] = useState<string | null>(null);
  const lastSeq = useRef(0);

  useEffect(() => {
    let stopped = false;
    let ws: WebSocket | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;

    const add = (list: LiveEvent[], replace = false) => {
      if (replace) {
        lastSeq.current = list.reduce((m, e) => Math.max(m, e.seq ?? 0), 0);
        setEvents(list);
        return;
      }
      const fresh = list.filter((e) => (e.seq ?? 0) > lastSeq.current);
      if (!fresh.length) return;
      lastSeq.current = Math.max(lastSeq.current, ...fresh.map((e) => e.seq ?? 0));
      setEvents((prev) => [...prev, ...fresh].slice(-600));
    };

    const startPolling = () => {
      if (poll || stopped) return;
      setConn("polling");
      poll = setInterval(async () => {
        try {
          const r = await fetch(`/api/live/events?since=${lastSeq.current}`);
          const j = (await r.json()) as { demo: boolean; events: LiveEvent[] };
          if (!j.demo) setConn("off");
          else {
            setConn("polling");
            add(j.events);
          }
        } catch {
          // keep trying
        }
      }, 1000);
    };

    const connect = async () => {
      try {
        const s = (await (await fetch("/api/live/status")).json()) as { demo: boolean; available: boolean; phone?: string | null };
        setPhone(s.phone ?? null);
        if (!s.available) return setConn("unavailable");
        if (!s.demo) {
          setConn("off");
          retry = setTimeout(connect, 5000);
          return;
        }
      } catch {
        retry = setTimeout(connect, 5000);
        return;
      }
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/api/live/ws`);
      let opened = false;
      ws.onopen = () => {
        opened = true;
        setConn("live");
        if (poll) clearInterval(poll), (poll = null);
        ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 25000);
      };
      ws.onmessage = (m) => {
        if (m.data === "pong") return;
        try {
          const e = JSON.parse(m.data as string) as LiveEvent & { events?: LiveEvent[] };
          if (e.type === "snapshot") add(e.events ?? [], true);
          else add([e]);
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        if (ping) clearInterval(ping);
        if (stopped) return;
        if (!opened) startPolling();
        retry = setTimeout(connect, 3000);
      };
    };
    void connect();
    return () => {
      stopped = true;
      ws?.close();
      if (poll) clearInterval(poll);
      if (retry) clearTimeout(retry);
      if (ping) clearInterval(ping);
    };
  }, []);

  return { events, conn, phone };
}

function SourceRow({ id, s }: { id: string; s: { ms?: number; ok?: boolean } }) {
  const meta = SOURCES[id] ?? { label: id, org: "" };
  const state = s.ms === undefined ? "run" : s.ok === false ? "bad" : "ok";
  return (
    <li className={`lv-src lv-${state}`}>
      <span className="lv-icon" aria-hidden="true">
        {state === "run" ? "" : state === "ok" ? "✓" : "–"}
      </span>
      <span className="lv-src-label">
        {meta.label}
        <small>{meta.org}</small>
      </span>
      <span className="lv-ms">{state === "run" ? "…" : state === "bad" ? "skipped" : ms(s.ms)}</span>
    </li>
  );
}

function sortedSources(m: Map<string, { ms?: number; ok?: boolean }>) {
  return [...m.entries()].sort((a, b) => SOURCE_ORDER.indexOf(a[0]) - SOURCE_ORDER.indexOf(b[0]));
}

function ToolStep({ step }: { step: Extract<Step, { kind: "tool" }> }) {
  const input = step.input as Record<string, unknown> | undefined;
  const detail =
    step.name === "find_location" && input?.zip
      ? `ZIP ${String(input.zip)}`
      : step.name === "build_rotation_plan" && input
        ? [input.place_name, Array.isArray(input.recent_crops) && input.recent_crops.length ? `grew ${input.recent_crops.join(", ")}` : null, input.water ? WATER[String(input.water)] : null]
            .filter(Boolean)
            .join(" · ")
        : "";
  return (
    <div className={`lv-tool ${!step.done ? "lv-tool-run" : step.waiting ? "" : step.ok === false ? "lv-tool-bad" : "lv-tool-ok"}`}>
      <div className="lv-tool-head">
        <span className="lv-tool-tag">Tool</span>
        <strong>{TOOLS[step.name] ?? step.name}</strong>
        <span className="lv-ms">{!step.done ? "running…" : step.waiting ? "waits" : step.ok === false ? "didn't work" : ms(step.ms)}</span>
      </div>
      {step.waiting ? <p className="lv-tool-detail">Asks what the farmer grew this year first</p> : detail && <p className="lv-tool-detail">{detail}</p>}
      {step.sources.size > 0 && (
        <ul className="lv-srcs">
          {sortedSources(step.sources).map(([id, s]) => (
            <SourceRow key={id} id={id} s={s} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PlanResult({ plan }: { plan: Record<string, unknown> }) {
  const years = (plan.years as { year: number; crop: string; cropName: string; cover: string | null }[]) ?? [];
  const current = plan.current as { label: string; netPerAcre: number; badYearsIn10: number } | null;
  const replay = plan.replay as { year: number; rainIn: number | null; typicalRainIn: number | null; currentNet: number | null; planNet: number | null } | null;
  return (
    <section className="lv-card lv-plan" aria-live="polite">
      <p className="eyebrow">The plan the caller heard</p>
      <h2>{plan.place ? `For ${String(plan.place)}` : "Recommended plan"}</h2>
      <div className="lv-years">
        {years.map((y) => (
          <div key={y.year} className="lv-year" style={{ ["--crop" as string]: `var(--crop-${y.crop === "winter_wheat" ? "winter-wheat" : y.crop})` }}>
            <span>{y.year}</span>
            <strong>{y.cropName}</strong>
            {y.cover && <small>+ {y.cover}</small>}
          </div>
        ))}
      </div>
      <dl className="lv-stats">
        <div>
          <dt>Bad years</dt>
          <dd>
            {String(plan.badYearsIn10 ?? "–")} <small>in 10</small>
          </dd>
        </div>
        {current && (
          <div>
            <dt>Current crops</dt>
            <dd>
              {current.badYearsIn10} <small>in 10</small>
            </dd>
          </div>
        )}
        <div>
          <dt>Profit</dt>
          <dd>
            {money(plan.netPerAcre)}
            <small>/acre/yr</small>
          </dd>
        </div>
        <div>
          <dt>Water</dt>
          <dd className="lv-small">{WATER[String(plan.water)] ?? "–"}</dd>
        </div>
      </dl>
      {replay && (
        <p className="lv-replay">
          <strong>Worst past year: {replay.year}.</strong>{" "}
          {replay.rainIn != null && replay.typicalRainIn != null && `${replay.rainIn.toFixed(1)} in of summer rain (usually ${replay.typicalRainIn.toFixed(1)}). `}
          {replay.currentNet != null && replay.planNet != null && `Current crops ${money(replay.currentNet)}/acre, this plan ${money(replay.planNet)}/acre.`}
        </p>
      )}
    </section>
  );
}

function FieldWatchPanel({ events }: { events: LiveEvent[] }) {
  const runs = events.filter((e) => e.type === "fieldwatch.run").slice(-5).reverse();
  return (
    <section className="lv-card lv-watch">
      <p className="eyebrow">Field Watch</p>
      <h2>Background checks</h2>
      {runs.length === 0 ? (
        <p className="lv-muted">SoilSense checks watched fields on its own every hour, with no browser open. New checks appear here.</p>
      ) : (
        <ul>
          {runs.map((r) => (
            <li key={String(r.runId ?? r.seq)} className={`lv-watch-${String(r.status)}`}>
              <span className="lv-dot" aria-hidden="true" />
              <div>
                <strong>{String(r.fieldName ?? r.fieldId)}</strong>
                <p>{String(r.headline ?? "")}</p>
                <small>
                  {r.trigger === "manual" ? "Checked on request" : "Automatic check"} · {time(r.checkedAt ?? r.at)}
                  {r.dataThrough ? ` · NASA data through ${String(r.dataThrough)}` : ""}
                </small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function LivePage({ onMenu }: { onMenu: () => void }) {
  const { events, conn, phone } = useLiveEvents();
  const calls = useMemo(() => buildCalls(events), [events]);
  const call = calls[0];
  const feed = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
  }, [call?.steps.length]);

  const status =
    conn === "off"
      ? "Demo mode is off. A team member can turn it on in Settings."
      : conn === "unavailable"
        ? "The live screen isn't set up on this server."
        : !call
          ? "Waiting for a call…"
          : call.ended
            ? `Call ended · ${time(call.startedAt)}`
            : "On a call now";

  return (
    <div className="app live">
      <button type="button" className="sb-toggle" aria-label="Open sidebar" onClick={onMenu}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <main className="lv-wrap">
        <header className="lv-head">
          <div>
            <p className="eyebrow">Live</p>
            <h1>Watch a call</h1>
            <p className="intro-lead">
              Every word, every tool the phone agent uses, and every NASA and USDA source it pulls, as it happens.
              {phone ? (
                <>
                  {" "}
                  Call <strong className="lv-phone">{phone}</strong> to try it.
                </>
              ) : null}
            </p>
          </div>
          <span className={`lv-status ${call && !call.ended && conn !== "off" ? "lv-status-on" : ""}`}>
            <span className="lv-dot" aria-hidden="true" />
            {status}
            {conn === "polling" && <small> (updating every second)</small>}
          </span>
        </header>

        <div className="lv-grid">
          <section className="lv-card lv-call">
            <div className="lv-call-head">
              <h2>Conversation</h2>
              {call && (
                <span className="lv-muted">
                  {call.caller ?? "Caller"}
                  {call.lastLang ? ` · speaking ${call.lastLang.toUpperCase()}` : ""}
                </span>
              )}
            </div>
            <div className="lv-feed" ref={feed}>
              {!call && <p className="lv-empty">When someone calls, the conversation shows up here.</p>}
              {call?.steps.map((s) =>
                s.kind === "prefetch" ? (
                  <div key={s.seq} className="lv-tool lv-tool-ok lv-prefetch">
                    <div className="lv-tool-head">
                      <span className="lv-tool-tag">Background</span>
                      <strong>Loading field data while the caller talks</strong>
                    </div>
                    <ul className="lv-srcs">
                      {sortedSources(call.prefetch).map(([id, src]) => (
                        <SourceRow key={id} id={id} s={src} />
                      ))}
                    </ul>
                  </div>
                ) : s.kind === "say" ? (
                  <div key={s.seq} className={`lv-say lv-say-${s.who}`}>
                    <span className="lv-who">
                      {s.who === "caller" ? "Farmer" : "SoilSense"}
                      {s.who === "caller" && s.lang ? <em>{s.lang.toUpperCase()}</em> : null}
                    </span>
                    <p>
                      {s.text}
                      {s.interrupted && <small> (interrupted)</small>}
                    </p>
                  </div>
                ) : s.kind === "tool" ? (
                  <ToolStep key={s.seq} step={s} />
                ) : s.kind === "sms" ? (
                  <div key={s.seq} className={`lv-tool ${s.ok ? "lv-tool-ok" : "lv-tool-bad"}`}>
                    <div className="lv-tool-head">
                      <span className="lv-tool-tag">Text</span>
                      <strong>{s.ok ? `Plan texted to ${s.to ?? "the caller"}` : "The text message didn't go through"}</strong>
                    </div>
                  </div>
                ) : (
                  <div key={s.seq} className="lv-tool lv-tool-bad">
                    <div className="lv-tool-head">
                      <strong>The agent had trouble with that turn and asked again</strong>
                    </div>
                  </div>
                ),
              )}
              {call?.ended && <p className="lv-empty">Call ended.</p>}
            </div>
          </section>

          <div className="lv-side">
            {call?.plan ? (
              <PlanResult plan={call.plan} />
            ) : (
              <section className="lv-card">
                <p className="eyebrow">The plan</p>
                <h2>Not built yet</h2>
                <p className="lv-muted">After the caller gives a ZIP code and their crop, the 3-year plan appears here.</p>
              </section>
            )}
            <FieldWatchPanel events={events} />
          </div>
        </div>
      </main>
    </div>
  );
}
