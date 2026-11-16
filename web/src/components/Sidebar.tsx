import { LANGUAGES, LANGUAGE_NAMES } from "../../../src/shared/language";
import { howItWorksCopy, useI18n } from "../i18n";
import { useEffect, useRef } from "react";
import type { User } from "../auth";
import type { ScoutChat } from "../chats";
import { LogoMark } from "./Logo";
import { NavIcon } from "./NavIcons";

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
          <a href="#/explore" className={route === "explore" ? "on" : ""} onClick={() => onNavigate("explore")}><NavIcon kind="explore" />{tx("Explore")}</a>
          <a href="#/demo" className={route === "demo" ? "on" : ""} onClick={() => onNavigate("demo")}><NavIcon kind="demo" />{tx("Demo farms")}</a>
          <a href="#/field-watch" className={route === "planner" ? "on" : ""} onClick={() => onNavigate("planner")}><NavIcon kind="planner" />{tx("Field Watch")}</a>
          <a href="#/scout" className={route === "scout" ? "on" : ""} onClick={() => onNavigate("scout")}>
            <NavIcon kind="sprout" />
            Sprout
            <span className="sb-tag">{tx("AI")}</span>
          </a>
          <a href="#/live" className={route === "live" ? "on" : ""} onClick={() => onNavigate("live")}><NavIcon kind="live" />{tx("Live call")}</a>
          <a href="#/sources" className={route === "sources" ? "on" : ""} onClick={() => onNavigate("sources")}><NavIcon kind="sources" />{tx("Sources")}</a>
          <a href="#/how-it-works" className={route === "how-it-works" ? "on" : ""} aria-current={route === "how-it-works" ? "page" : undefined} onClick={() => onNavigate("how-it-works")}>
            <NavIcon kind="how-it-works" />
            {howItWorksCopy.title[language]}
          </a>
          <a href="#/settings" className={route === "settings" ? "on" : ""} onClick={() => onNavigate("settings")}><NavIcon kind="settings" />{tx("Settings")}</a>
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
