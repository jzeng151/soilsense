import { useCallback, useEffect, useMemo, useState } from "react";
import { notifySignedOut } from "../auth";

// ---------- Types mirrored from src/worker/voiceSettings.ts ----------

type ToolName = "find_location" | "build_rotation_plan" | "send_plan_by_text" | "end_call";
interface ToolMeta {
  name: ToolName;
  title: string;
  about: string;
  required: boolean;
  defaultDescription: string;
}
interface VoiceSettings {
  greeting: string;
  instructions: string;
  tools: Record<ToolName, { enabled: boolean; description: string }>;
  languages: { autoDetect: boolean; enabled: string[] };
}
interface LanguageMeta {
  code: string;
  name: string;
  native: string;
}
interface VoiceConfig {
  settings: VoiceSettings;
  updatedAt: number | null;
  defaults: VoiceSettings;
  lockedRules: string;
  tools: ToolMeta[];
  languages: LanguageMeta[];
  limits: { greeting: number; instructions: number; toolDescription: number };
  status: { database: boolean; gemini: boolean; twilio: boolean; mode: string; model: string };
}
interface CallRow {
  callSid: string;
  startedAt: number;
  lastAt: number;
  turns: number;
  toolCalls: number;
  problems: number;
  caller: string | null;
  place: string | null;
  topPlan: string | null;
  ended: boolean;
}
interface CallEvent {
  id: number;
  at: number;
  kind: "session_start" | "caller" | "agent" | "tool" | "error" | "session_end";
  name: string | null;
  detail: string | null;
  durationMs: number | null;
  ok: number | null;
}

// ---------- API ----------

const TOKEN_KEY = "soilsense-admin-token";

function readToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}
function writeToken(t: string) {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable: stay logged in for this page view only
  }
}

class AuthError extends Error {}

async function adminFetch<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) throw new AuthError(body.error ?? "Wrong password.");
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

const fmtWhen = (ms: number) => new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const fmtSecs = (ms: number | null) => (ms === null ? "" : `${(ms / 1000).toFixed(1)} s`);

/** Friendly names for tools in the call transcript. */
const TOOL_DONE: Record<string, string> = {
  find_location: "Found location",
  build_rotation_plan: "Built the crop plan",
  send_plan_by_text: "Sent text message",
  end_call: "Ended the call",
};

// ---------- Page ----------

type Tab = "instructions" | "tools" | "activity";

export function SettingsPage({ onMenu }: { onMenu: () => void }) {
  const [token, setToken] = useState(readToken);
  // Only ask for a password if the server says one is required.
  const [needsLogin, setNeedsLogin] = useState(false);
  const [tab, setTab] = useState<Tab>("instructions");
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [draft, setDraft] = useState<VoiceSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // No Settings password: a 401 means the sign-in session ended, so go back to the normal sign-in screen.
  const logout = useCallback((_msg?: string) => {
    writeToken("");
    notifySignedOut();
  }, []);

  const load = useCallback(
    async (t: string) => {
      try {
        const c = await adminFetch<VoiceConfig>(t, "/voice-agent");
        setConfig(c);
        setDraft(c.settings);
        setError(null);
      } catch (e) {
        if (e instanceof AuthError) logout(e.message);
        else setError((e as Error).message);
      }
    },
    [logout],
  );

  useEffect(() => {
    if (!needsLogin) void load(token);
  }, [token, needsLogin, load]);

  const dirty = useMemo(() => Boolean(config && draft && JSON.stringify(config.settings) !== JSON.stringify(draft)), [config, draft]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((n) => (n === msg ? null : n)), 4000);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const r = await adminFetch<{ settings: VoiceSettings; updatedAt: number }>(token, "/voice-agent", { method: "PUT", body: JSON.stringify(draft) });
      setConfig((c) => (c ? { ...c, settings: r.settings, updatedAt: r.updatedAt } : c));
      setDraft(r.settings);
      setError(null);
      flash("Saved. The next call will use this.");
    } catch (e) {
      if (e instanceof AuthError) logout(e.message);
      else setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      const r = await adminFetch<{ settings: VoiceSettings; updatedAt: null }>(token, "/voice-agent/reset", { method: "POST" });
      setConfig((c) => (c ? { ...c, settings: r.settings, updatedAt: null } : c));
      setDraft(r.settings);
      flash("Back to the original settings.");
    } catch (e) {
      if (e instanceof AuthError) logout(e.message);
      else setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const live = config ? config.status.mode === "voice agent" && config.status.gemini && config.status.twilio : false;

  return (
    <div className="app settings">
      <button type="button" className="sb-toggle" aria-label="Open sidebar" onClick={onMenu}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <main className="st-wrap">
        <header className="st-head">
          <div>
            <h1>Phone agent</h1>
            {config && (
              <p className={`st-live ${live ? "ok" : "warn"}`}>
                <span className="st-dot" aria-hidden="true" />
                {live ? "Live on your phone number" : !config.status.gemini ? "Not working: AI key missing" : !config.status.twilio ? "Not working: Twilio not set up" : "Using the keypad menu instead"}
              </p>
            )}
          </div>
        </header>

        {needsLogin ? (
          <Login
            error={error}
            onLogin={(t) => {
              writeToken(t);
              setToken(t);
              setNeedsLogin(false);
            }}
          />
        ) : !config || !draft ? (
          error ? <p className="error">{error}</p> : <p className="loading">Loading…</p>
        ) : (
          <>
            <div className="st-tabs" role="tablist">
              {(
                [
                  ["instructions", "What it says"],
                  ["tools", "What it can do"],
                  ["activity", "Call history"],
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
            </div>

            {error && <p className="error">{error}</p>}
            {notice && <p className="st-notice">{notice}</p>}

            {tab === "instructions" && <InstructionsTab config={config} draft={draft} setDraft={setDraft} onReset={() => void reset()} saving={saving} />}
            {tab === "tools" && <ToolsTab config={config} draft={draft} setDraft={setDraft} />}
            {tab === "activity" && (
              <>
                <LiveDemoBlock token={token} onAuthError={logout} />
                <ActivityTab token={token} onAuthError={logout} />
              </>
            )}

            {dirty && tab !== "activity" && (
              <div className="st-savebar">
                <span>Unsaved changes</span>
                <div>
                  <button type="button" className="ghost" onClick={() => setDraft(config.settings)} disabled={saving}>
                    Undo
                  </button>
                  <button type="button" className="primary small" onClick={() => void save()} disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Login({ error, onLogin }: { error: string | null; onLogin: (t: string) => void }) {
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(error);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setChecking(true);
    try {
      await adminFetch(value.trim(), "/check");
      onLogin(value.trim());
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setChecking(false);
    }
  };
  return (
    <form className="st-card st-login" onSubmit={submit}>
      <label htmlFor="admin-pw">Enter the admin password to continue</label>
      <div className="ask-row">
        <input id="admin-pw" type="password" autoComplete="current-password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Password" />
        <button type="submit" className="primary small" disabled={checking || !value.trim()}>
          {checking ? "…" : "Unlock"}
        </button>
      </div>
      {err && <p className="st-err">{err}</p>}
    </form>
  );
}

// ---------- What it says ----------

function InstructionsTab({
  config,
  draft,
  setDraft,
  onReset,
  saving,
}: {
  config: VoiceConfig;
  draft: VoiceSettings;
  setDraft: (s: VoiceSettings) => void;
  onReset: () => void;
  saving: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const isDefault = JSON.stringify(config.settings) === JSON.stringify(config.defaults);
  return (
    <div className="st-card">
      <label className="st-label" htmlFor="st-greeting">
        First thing callers hear
      </label>
      <textarea id="st-greeting" className="set-text" rows={2} maxLength={config.limits.greeting} value={draft.greeting} onChange={(e) => setDraft({ ...draft, greeting: e.target.value })} />

      <label className="st-label" htmlFor="st-instr">
        Instructions for the agent
      </label>
      <p className="st-help">Tell it who it is, what to ask the caller, and how to explain the plan.</p>
      <textarea
        id="st-instr"
        className="set-text"
        rows={11}
        maxLength={config.limits.instructions}
        value={draft.instructions}
        onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
      />

      <LanguagesBlock config={config} draft={draft} setDraft={setDraft} />

      <div className="st-card-foot">
        <details className="st-rules">
          <summary>Built-in safety rules (always on)</summary>
          <pre>{config.lockedRules.replace(/^Rules that always apply:\n/, "")}</pre>
        </details>
        {!isDefault &&
          (confirm ? (
            <span className="st-confirm">
              Go back to the original text?{" "}
              <button type="button" className="link-btn" onClick={() => setConfirm(false)}>
                No
              </button>{" "}
              <button
                type="button"
                className="link-btn st-danger"
                disabled={saving}
                onClick={() => {
                  setConfirm(false);
                  onReset();
                }}
              >
                Yes, reset
              </button>
            </span>
          ) : (
            <button type="button" className="link-btn" onClick={() => setConfirm(true)}>
              Reset to original
            </button>
          ))}
      </div>
    </div>
  );
}

function LanguagesBlock({ config, draft, setDraft }: { config: VoiceConfig; draft: VoiceSettings; setDraft: (s: VoiceSettings) => void }) {
  const lang = draft.languages;
  const toggle = (code: string) => {
    if (code === "en") return;
    const enabled = lang.enabled.includes(code) ? lang.enabled.filter((c) => c !== code) : [...lang.enabled, code];
    setDraft({ ...draft, languages: { ...lang, enabled: config.languages.map((l) => l.code).filter((c) => enabled.includes(c)) } });
  };
  return (
    <div className="st-lang">
      <div className="st-tool-row">
        <div className="st-tool-text">
          <b>Speak the caller's language</b>
          <span>The agent hears which language the caller speaks and answers in it, switching if they switch.</span>
        </div>
        <label className="switch" title={lang.autoDetect ? "Turn off" : "Turn on"}>
          <input
            type="checkbox"
            checked={lang.autoDetect}
            onChange={(e) => setDraft({ ...draft, languages: { ...lang, autoDetect: e.target.checked } })}
            aria-label={`Speak the caller's language: ${lang.autoDetect ? "on" : "off"}`}
          />
          <span className="switch-track" aria-hidden="true" />
        </label>
      </div>
      {lang.autoDetect ? (
        <div className="st-langs" role="group" aria-label="Languages">
          {config.languages.map((l) => {
            const on = lang.enabled.includes(l.code);
            return (
              <button key={l.code} type="button" className={`st-lang-chip ${on ? "on" : ""}`} aria-pressed={on} disabled={l.code === "en"} onClick={() => toggle(l.code)} title={l.name}>
                {on ? "✓ " : ""}
                {l.native}
                {l.native !== l.name && <small> {l.name}</small>}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="st-help">English only.</p>
      )}
    </div>
  );
}

// ---------- What it can do ----------

function ToolsTab({ config, draft, setDraft }: { config: VoiceConfig; draft: VoiceSettings; setDraft: (s: VoiceSettings) => void }) {
  const [editing, setEditing] = useState<ToolName | null>(null);
  const setTool = (name: ToolName, patch: Partial<{ enabled: boolean; description: string }>) =>
    setDraft({ ...draft, tools: { ...draft.tools, [name]: { ...draft.tools[name], ...patch } } });
  return (
    <div className="st-card">
      <p className="st-help st-help-top">The agent decides by itself when to use each of these during a call.</p>
      <ul className="st-tools">
        {config.tools.map((t) => {
          const cur = draft.tools[t.name];
          const open = editing === t.name;
          return (
            <li key={t.name} className={cur.enabled ? "" : "off"}>
              <div className="st-tool-row">
                <div className="st-tool-text">
                  <b>{t.title}</b>
                  <span>{t.about}</span>
                </div>
                {t.required ? (
                  <span className="st-always">Always on</span>
                ) : (
                  <label className="switch" title={cur.enabled ? "Turn off" : "Turn on"}>
                    <input type="checkbox" checked={cur.enabled} onChange={(e) => setTool(t.name, { enabled: e.target.checked })} aria-label={`${t.title}: ${cur.enabled ? "on" : "off"}`} />
                    <span className="switch-track" aria-hidden="true" />
                  </label>
                )}
              </div>
              {cur.enabled && (
                <button type="button" className="link-btn st-edit" onClick={() => setEditing(open ? null : t.name)}>
                  {open ? "Close" : "Edit when it's used"}
                </button>
              )}
              {open && cur.enabled && (
                <div className="st-tool-edit">
                  <textarea
                    className="set-text"
                    rows={2}
                    maxLength={config.limits.toolDescription}
                    value={cur.description}
                    onChange={(e) => setTool(t.name, { description: e.target.value })}
                    aria-label={`When to use ${t.title}`}
                  />
                  {cur.description !== t.defaultDescription && (
                    <button type="button" className="link-btn" onClick={() => setTool(t.name, { description: t.defaultDescription })}>
                      Use original text
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- Call history ----------

/** Demo mode: show calls in real time on the public Live call page (#/live). Off by default for caller privacy. */
function LiveDemoBlock({ token, onAuthError }: { token: string; onAuthError: (msg?: string) => void }) {
  const [state, setState] = useState<{ on: boolean; available: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    adminFetch<{ on: boolean; available: boolean }>(token, "/live-demo")
      .then(setState)
      .catch((e) => (e instanceof AuthError ? onAuthError(e.message) : setErr((e as Error).message)));
  }, [token, onAuthError]);
  const toggle = async (on: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      await adminFetch(token, "/live-demo", { method: "PUT", body: JSON.stringify({ on }) });
      setState((s) => (s ? { ...s, on } : s));
    } catch (e) {
      if (e instanceof AuthError) onAuthError(e.message);
      else setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    setBusy(true);
    try {
      await adminFetch(token, "/live-demo/clear", { method: "POST" });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!state) return err ? <p className="error">{err}</p> : null;
  return (
    <div className="st-card st-lang" style={{ marginBottom: "1rem" }}>
      <div className="st-tool-row">
        <div className="st-tool-text">
          <b>Show calls live (demo mode)</b>
          <span>
            While on, anyone can watch calls as they happen on the <a href="#/live">Live call</a> page: the words, the tools and the data sources. Caller numbers are
            masked. Turn it off after your demo.
          </span>
        </div>
        <label className="switch" title={state.on ? "Turn off" : "Turn on"}>
          <input type="checkbox" checked={state.on} disabled={busy || !state.available} onChange={(e) => void toggle(e.target.checked)} aria-label={`Show calls live: ${state.on ? "on" : "off"}`} />
          <span className="switch-track" aria-hidden="true" />
        </label>
      </div>
      {state.on && (
        <p className="hint" style={{ margin: "0.5rem 0 0" }}>
          <button type="button" className="link-btn" onClick={() => void clear()} disabled={busy}>
            Clear the live page
          </button>{" "}
          before a demo so it starts empty.
        </p>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  );
}

function ActivityTab({ token, onAuthError }: { token: string; onAuthError: (msg?: string) => void }) {
  const [calls, setCalls] = useState<CallRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<CallEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminFetch<{ calls: CallRow[] }>(token, "/calls?limit=30");
      setCalls(r.calls);
      setSelected((s) => s ?? r.calls[0]?.callSid ?? null);
      setError(null);
    } catch (e) {
      if (e instanceof AuthError) onAuthError(e.message);
      else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, onAuthError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selected) return;
    setEvents(null);
    adminFetch<{ events: CallEvent[] }>(token, `/calls/${encodeURIComponent(selected)}`)
      .then((r) => setEvents(r.events))
      .catch((e) => (e instanceof AuthError ? onAuthError(e.message) : setError((e as Error).message)));
  }, [selected, token, onAuthError]);

  if (error) return <p className="error">{error}</p>;
  if (!calls) return <p className="loading">Loading…</p>;
  if (calls.length === 0)
    return (
      <div className="st-card st-empty">
        <p>No calls yet. Call your Soil Sense number, then come back here.</p>
        <button type="button" className="ghost" onClick={() => void refresh()} disabled={loading}>
          Refresh
        </button>
      </div>
    );

  return (
    <div className="st-history">
      <div className="st-card st-calls">
        <div className="st-calls-head">
          <b>Recent calls</b>
          <button type="button" className="link-btn" onClick={() => void refresh()} disabled={loading}>
            {loading ? "…" : "Refresh"}
          </button>
        </div>
        <ul>
          {calls.map((c) => (
            <li key={c.callSid}>
              <button type="button" className={selected === c.callSid ? "on" : ""} onClick={() => setSelected(c.callSid)}>
                <span className="st-call-when">
                  {fmtWhen(c.startedAt)}
                  {c.problems > 0 && <span className="st-warn-dot" title="Something went wrong on this call" />}
                </span>
                <span className="st-call-where">{c.place ?? "No location"}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="st-card st-transcript">
        {!events ? (
          <p className="loading">Loading…</p>
        ) : (
          <ol>
            {events.map((e) => (
              <TranscriptLine key={e.id} e={e} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function TranscriptLine({ e }: { e: CallEvent }) {
  const [open, setOpen] = useState(false);
  if (e.kind === "session_start" || e.kind === "session_end") return null;

  if (e.kind === "caller" || e.kind === "agent") {
    return (
      <li className={`st-msg st-msg-${e.kind}`}>
        <span className="st-who">
          {e.kind === "caller" ? "Caller" : "Agent"}
          {e.kind === "caller" && e.name && <span className="st-lang-tag">{e.name.toUpperCase()}</span>}
        </span>
        <p>{e.detail}</p>
      </li>
    );
  }

  const failed = e.kind === "error" || e.ok === 0;
  const label = e.kind === "error" ? "Something went wrong" : (TOOL_DONE[e.name ?? ""] ?? e.name);
  let details = e.detail ?? "";
  try {
    details = JSON.stringify(JSON.parse(details), null, 2);
  } catch {
    // plain text
  }
  return (
    <li className={`st-step ${failed ? "fail" : ""}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span aria-hidden="true">{failed ? "✕" : "✓"}</span> {failed && e.kind === "tool" ? `${label} failed` : label}
        {e.durationMs !== null && <span className="st-step-time">{fmtSecs(e.durationMs)}</span>}
      </button>
      {open && details && <pre>{details}</pre>}
    </li>
  );
}
