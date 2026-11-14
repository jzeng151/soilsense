import { useState, type FormEvent } from "react";
import { signIn, signUp, type User } from "../auth";
import { FurrowArcs, LogoMark } from "../components/Logo";

type Mode = "signin" | "signup";

const COPY: Record<Mode, { title: string; lead: string; submit: string; busy: string; switchText: string; switchCta: string }> = {
  signin: {
    title: "Welcome back",
    lead: "Sign in to plan your next three years.",
    submit: "Sign in",
    busy: "Signing in…",
    switchText: "New to SoilSense?",
    switchCta: "Create an account",
  },
  signup: {
    title: "Create your account",
    lead: "Free for farmers, advisors and extension agents.",
    submit: "Create account",
    busy: "Creating account…",
    switchText: "Already have an account?",
    switchCta: "Sign in",
  },
};

export function AuthPage({ onSignedIn }: { onSignedIn: (u: User) => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = COPY[mode];

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (mode === "signup" && password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    setBusy(true);
    try {
      const user = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
      onSignedIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <aside className="auth-brand">
        <div className="auth-logo">
          <LogoMark size={32} />
          <span>SoilSense</span>
        </div>
        <div className="auth-pitch">
          <h1>
            Crop rotations for a <em>changing climate.</em>
          </h1>
          <ul>
            <li>35 years of NASA climate data for your exact field</li>
            <li>Every 3-year rotation tested against your soil and goals</li>
            <li>A ranked plan with the reasons behind it</li>
          </ul>
        </div>
        <p className="auth-brand-foot">NASA Space Apps 2026 · Field Shift challenge</p>
        <FurrowArcs />
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-logo auth-logo-mobile">
            <LogoMark size={28} />
            <span>SoilSense</span>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Account">
            <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "on" : ""} onClick={() => switchMode("signin")}>
              Sign in
            </button>
            <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "on" : ""} onClick={() => switchMode("signup")}>
              Create account
            </button>
          </div>

          <header className="auth-head">
            <h2>{t.title}</h2>
            <p>{t.lead}</p>
          </header>

          <form className="auth-form" onSubmit={submit} noValidate>
            <label className="auth-field" htmlFor="auth-email">
              <span>Email</span>
              <input
                id="auth-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@farm.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </label>

            <label className="auth-field" htmlFor="auth-password">
              <span>Password</span>
              <div className="auth-pw">
                <input
                  id="auth-password"
                  type={showPw ? "text" : "password"}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === "signup" ? 8 : undefined}
                  maxLength={128}
                />
                <button type="button" className="auth-pw-toggle" onClick={() => setShowPw((s) => !s)} aria-pressed={showPw} aria-label={showPw ? "Hide password" : "Show password"}>
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
              {mode === "signup" && <small>Use 8 or more characters. A short phrase is easy to remember.</small>}
            </label>

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="auth-submit" disabled={busy || !email || !password}>
              {busy ? t.busy : t.submit}
            </button>
          </form>

          <p className="auth-switch">
            {t.switchText}{" "}
            <button type="button" onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}>
              {t.switchCta}
            </button>
          </p>
        </div>
        <p className="auth-fine">Built on NASA and USDA data.</p>
      </main>
    </div>
  );
}
