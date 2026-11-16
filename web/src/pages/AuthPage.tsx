import { useI18n } from "../i18n";
import { useState, type FormEvent } from "react";
import { signIn, signUp, type User } from "../auth";
import { LogoMark } from "../components/Logo";
import { Sprout } from "../components/Sprout";

type Mode = "signin" | "signup";

const COPY: Record<Mode, { title: string; lead: string; submit: string; busy: string; switchText: string; switchCta: string }> = {
  signin: {
    title: "Welcome back",
    lead: "Sign in to plan your next three years.",
    submit: "Sign in",
    busy: "Signing in…",
    switchText: "New to Soil Sense?",
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
  const { text: localize } = useI18n();
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
        <div className="auth-pitch">
          <p className="auth-eyebrow">NASA Space Apps NYC 2026</p>
          <p className="auth-name">Soil Sense</p>
          <p className="auth-tagline">{localize("Teaching satellites to speak Farmer.")}</p>
        </div>
        <Sprout mood="hello" width={230} className="auth-sprout" />
        <p className="auth-brand-foot">{localize("Meet Sprout. Rises where the soil needs a rest. Speaks your language, by phone.")}</p>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-logo auth-logo-mobile">
            <LogoMark size={32} />
            <span>Soil Sense</span>
          </div>

          <div className="auth-tabs" role="tablist" aria-label={localize("Account")}>
            <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "on" : ""} onClick={() => switchMode("signin")}>
              {localize("Sign in")}
            </button>
            <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "on" : ""} onClick={() => switchMode("signup")}>
              {localize("Create account")}
            </button>
          </div>

          <header className="auth-head">
            <h1>{localize(t.title)}</h1>
            <p>{localize(t.lead)}</p>
          </header>

          <form className="auth-form" onSubmit={submit} noValidate>
            <label className="auth-field" htmlFor="auth-email">
              <span>{localize("Email")}</span>
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
              <span>{localize("Password")}</span>
              <div className="auth-pw">
                <input
                  id="auth-password"
                  type={showPw ? "text" : "password"}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  placeholder={localize(mode === "signup" ? "At least 8 characters" : "Your password")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === "signup" ? 8 : undefined}
                  maxLength={128}
                />
                <button type="button" className="auth-pw-toggle" onClick={() => setShowPw((s) => !s)} aria-pressed={showPw} aria-label={localize(showPw ? "Hide password" : "Show password")}>
                  {localize(showPw ? "Hide" : "Show")}
                </button>
              </div>
              {mode === "signup" && <small>{localize("Use 8 or more characters. A short phrase is easy to remember.")}</small>}
            </label>

            {error && (
              <p className="auth-error" role="alert">
                {localize(error)}
              </p>
            )}

            <button type="submit" className="auth-submit" disabled={busy || !email || !password}>
              {localize(busy ? t.busy : t.submit)}
            </button>
          </form>

          <p className="auth-switch">
            {localize(t.switchText)}{" "}
            <button type="button" onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}>
              {localize(t.switchCta)}
            </button>
          </p>
        </div>
        <p className="auth-fine">{localize("Built on NASA and USDA data.")}</p>
      </main>
    </div>
  );
}
