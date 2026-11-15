import type { User } from "../auth";
import type { ScoutChat } from "../chats";
import { LogoMark } from "./Logo";

export type Route = "planner" | "scout" | "sources" | "settings" | "signin";

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
  return (
    <>
      <div className={`sb-scrim ${open ? "show" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sidebar theme-dark ${open ? "open" : ""}`} aria-label="Main navigation">
        <a className="sb-brand" href="#/" onClick={() => onNavigate("planner")}>
          <LogoMark />
          <span>SoilSense</span>
        </a>

        <button type="button" className="sb-new" onClick={onNewChat}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New chat
        </button>

        <nav className="sb-nav">
          <a href="#/" className={route === "planner" ? "on" : ""} onClick={() => onNavigate("planner")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
              <path d="M9 3v15M15 6v15" />
            </svg>
            Rotation planner
          </a>
          <a href="#/scout" className={route === "scout" ? "on" : ""} onClick={() => onNavigate("scout")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 5h16v11H9l-5 4z" />
              <path d="M8 10h.01M12 10h.01M16 10h.01" />
            </svg>
            Scout
            <span className="sb-tag">AI</span>
          </a>
          <a href="#/sources" className={route === "sources" ? "on" : ""} onClick={() => onNavigate("sources")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <ellipse cx="12" cy="6" rx="7" ry="3" />
              <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
              <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
            </svg>
            Sources
          </a>
          <a href="#/settings" className={route === "settings" ? "on" : ""} onClick={() => onNavigate("settings")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
            Settings
          </a>
        </nav>

        <div className="sb-section">
          <p className="sb-label">Recent chats</p>
          {chats.length === 0 && <p className="sb-empty">No chats yet. Ask Scout anything about a field.</p>}
          <ul className="sb-chats">
            {chats.map((c) => (
              <li key={c.id} className={route === "scout" && c.id === activeChatId ? "on" : ""}>
                <button type="button" className="sb-chat" onClick={() => onOpenChat(c.id)} title={c.title}>
                  {c.title}
                </button>
                <button type="button" className="sb-del" aria-label={`Delete chat ${c.title}`} onClick={() => onDeleteChat(c.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>

        <a className="sb-foot" href="#/sources" onClick={() => onNavigate("sources")}>
          Data: NASA · USDA · FCC — see all sources
        </a>

        {user ? (
          <div className="sb-user">
            <span className="sb-avatar" aria-hidden="true">
              {user.email.charAt(0).toUpperCase()}
            </span>
            <span className="sb-email" title={user.email}>
              {user.email}
            </span>
            <button type="button" className="sb-signout" onClick={onSignOut} aria-label="Sign out" title="Sign out">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
                <path d="M10 17l-5-5 5-5M5 12h11" />
              </svg>
            </button>
          </div>
        ) : (
          <a className="sb-team" href="#/signin" onClick={() => onNavigate("signin")}>
            Team sign-in
          </a>
        )}
      </aside>
    </>
  );
}
