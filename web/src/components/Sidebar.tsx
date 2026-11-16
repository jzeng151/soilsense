import { LANGUAGES, LANGUAGE_NAMES } from "../../../src/shared/language";
import { howItWorksCopy, useI18n } from "../i18n";
import { useEffect, useRef } from "react";
import type { User } from "../auth";
import type { ScoutChat } from "../chats";
import { LogoMark } from "./Logo";

export type Route = "planner" | "scout" | "live" | "sources" | "how-it-works" | "settings" | "signin" | "explore" | "demo";

interface Props {
  route: Route;
  /** null = public visitor (no account needed). */
  user: User | null;
  onSignOut: () => void;
  open: boolean;
  onClose: () => void;
  chats: ScoutChat[];
  activeChatId: string | null;
  onNavigate: (r: Route) => void;
  onNewChat: () => void;
  onOpenChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
}

export function Sidebar({ route, user, onSignOut, open, onClose, chats, activeChatId, onNavigate, onNewChat, onOpenChat, onDeleteChat }: Props) {
  const { t: tx } = useI18n();
  const { language, setLanguage } = useI18n();
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open || !window.matchMedia("(max-width: 860px)").matches) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>(".sb-close")?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "Tab") {
        const controls = [...(panel.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)') ?? [])].filter(el => el.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      previous?.focus();
    };
  }, [open, onClose]);
  return (
    <>
      <div className={`sb-scrim ${open ? "show" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside ref={panel} className={`sidebar theme-canopy ${open ? "open" : ""}`} aria-label={tx("Main navigation")} role={open ? "dialog" : undefined} aria-modal={open ? true : undefined}>
        <button type="button" className="sb-close" onClick={onClose}>{tx("Close navigation")}</button>
        <a className="sb-brand" href="#/" onClick={() => onNavigate("planner")}>
          <LogoMark size={36} />
          <span className="sb-wordmark">
            Soil Sense
            <small>{tx("Teaching satellites to speak Farmer")}</small>
          </span>
        </a>

        <button type="button" className="sb-new" onClick={onNewChat}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>{tx("New chat")}</button>

        {/* The planner page header has its own switcher; keep one language control per view. */}
        {route !== "planner" && <div className="language-switch" role="group" aria-label={tx("Language")}>
          {LANGUAGES.map((code) => <button key={code} type="button" lang={code} aria-label={code === "ko" ? LANGUAGE_NAMES[code] : `${code.toUpperCase()} ${LANGUAGE_NAMES[code]}`} aria-pressed={language === code} onClick={() => setLanguage(code)}>{code === "ko" ? LANGUAGE_NAMES[code] : code.toUpperCase()}</button>)}
        </div>}
        <nav className="sb-nav">
          <a href="#/explore" className={route === "explore" ? "on" : ""} onClick={() => onNavigate("explore")}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c6 5 6 13 0 18-6-5-6-13 0-18"/></svg>{tx("Explore")}</a>
          <a href="#/demo" onClick={() => onNavigate("demo")}>{tx("Demo farms")}</a>
          <a href="#/" className={route === "planner" ? "on" : ""} onClick={() => onNavigate("planner")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
              <path d="M9 3v15M15 6v15" />
            </svg>{tx("Rotation planner")}</a>
          <a href="#/scout" className={route === "scout" ? "on" : ""} onClick={() => onNavigate("scout")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 5h16v11H9l-5 4z" />
              <path d="M8 10h.01M12 10h.01M16 10h.01" />
            </svg>
            Sprout
            <span className="sb-tag">{tx("AI")}</span>
          </a>
          <a href="#/live" className={route === "live" ? "on" : ""} onClick={() => onNavigate("live")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
            </svg>{tx("Live call")}</a>
          <a href="#/sources" className={route === "sources" ? "on" : ""} onClick={() => onNavigate("sources")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <ellipse cx="12" cy="6" rx="7" ry="3" />
              <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
              <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
            </svg>{tx("Sources")}</a>
          <a href="#/how-it-works" className={route === "how-it-works" ? "on" : ""} aria-current={route === "how-it-works" ? "page" : undefined} onClick={() => onNavigate("how-it-works")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></svg>
            {howItWorksCopy.title[language]}
          </a>

          <a href="#/settings" className={route === "settings" ? "on" : ""} onClick={() => onNavigate("settings")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>{tx("Settings")}</a>
        </nav>

        <div className="sb-section">
          <p className="sb-label">{tx("Recent chats")}</p>
          {chats.length === 0 && <p className="sb-empty">{tx("No chats yet. Ask Sprout anything about a field.")}</p>}
          <ul className="sb-chats">
            {chats.map((c) => (
              <li key={c.id} className={route === "scout" && c.id === activeChatId ? "on" : ""}>
                <button type="button" className="sb-chat" onClick={() => onOpenChat(c.id)} title={c.title}>
                  {c.title}
                </button>
                <button type="button" className="sb-del" aria-label={tx("Delete chat {title}", { title: c.title })} onClick={() => onDeleteChat(c.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>

        <a className="sb-foot" href="#/sources" onClick={() => onNavigate("sources")}>{tx("Data: NASA · USDA · FCC — see all sources")}</a>

        {user ? (
          <div className="sb-user">
            <span className="sb-avatar" aria-hidden="true">
              {user.email.charAt(0).toUpperCase()}
            </span>
            <span className="sb-email" title={user.email}>
              {user.email}
            </span>
            <button type="button" className="sb-signout" onClick={onSignOut} aria-label={tx("Sign out")} title={tx("Sign out")}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
                <path d="M10 17l-5-5 5-5M5 12h11" />
              </svg>
            </button>
          </div>
        ) : (
          <a className="sb-team" href="#/signin" onClick={() => onNavigate("signin")}>{tx("Team sign-in")}</a>
        )}
      </aside>
    </>
  );
}
