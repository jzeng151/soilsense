import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { howItWorksCopy, useI18n } from "../../i18n";
import type { User } from "../../auth";
import { LogoMark } from "../Logo";
import { NavIcon, type NavIconKind } from "../NavIcons";
import { LANGUAGE_NAMES, LANGUAGES } from "../../../../src/shared/language";
import "./rail.css";

const LINKS = [
  { href: "#/explore", kind: "explore", label: "Explore" },
  { href: "#/demo", kind: "demo", label: "Demo farms" },
  { href: "#/field-watch", kind: "planner", label: "Field Watch" },
  { href: "#/scout", kind: "sprout", label: "Sprout" },
  { href: "#/live", kind: "live", label: "Live call" },
  { href: "#/sources", kind: "sources", label: "Sources" },
  { href: "#/how-it-works", kind: "how-it-works", label: "How it works" },
  { href: "#/settings", kind: "settings", label: "Settings" },
] as const satisfies readonly { href: string; kind: NavIconKind; label: string }[];
export type RailHref = (typeof LINKS)[number]["href"];

/** Signed-in team member (null = public visitor), provided once by the Shell so every rail shows the same account. */
export const NavAccountContext = createContext<{ user: User | null; onSignOut: () => void }>({ user: null, onSignOut: () => {} });

export const RAIL_STORAGE_KEY = "soilsense:nav-rail:v1";
const isPhone = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 700px)").matches;
/** Open by default on larger screens (remembered per browser); phones always start minimized. */
function initialOpen(): boolean {
  if (isPhone()) return false;
  try { return localStorage.getItem(RAIL_STORAGE_KEY) !== "closed"; } catch { return true; }
}

/** One open/minimized state for every page's rail. It is mirrored on <html data-rail> so CSS can size --rail-w:
 *  page content and Explore's overlays clear the rail instead of sitting under it. */
export const NavRailContext = createContext<{ open: boolean; setOpen: (open: boolean) => void }>({ open: true, setOpen: () => {} });

export function NavRailProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(initialOpen);
  useEffect(() => {
    document.documentElement.dataset.rail = open ? "open" : "closed";
  }, [open]);
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    // Phones use the open rail as a temporary drawer; only larger screens remember the choice.
    if (!isPhone()) try { localStorage.setItem(RAIL_STORAGE_KEY, next ? "open" : "closed"); } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    if (!open || !isPhone()) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenState(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const value = useMemo(() => ({ open, setOpen }), [open, setOpen]);
  return <NavRailContext.Provider value={value}>{children}</NavRailContext.Provider>;
}

/** The app-wide navigation rail (Explore, Demo and every other page). It stays where it is: the toggle at the top
 *  expands it to show labels or minimizes it to icons, and page content always starts beside it (never underneath).
 *  On phones the expanded rail is a drawer over the page (scrim, Escape or a link closes it).
 *  Labels are always in the DOM (clipped while minimized), so every control's accessible name is its visible text.
 *  `solid` is for pages without a map behind the rail; `current` overrides the hash-derived active link. */
export function ExploreRail({ onLayers, solid = false, current }: { onLayers?: () => void; solid?: boolean; current?: RailHref | null }) {
  const { t, language, setLanguage } = useI18n();
  const { user, onSignOut } = useContext(NavAccountContext);
  const { open, setOpen } = useContext(NavRailContext);
  const here = current !== undefined ? current : typeof window === "undefined" ? "" : window.location.hash.split("?")[0];
  const next = LANGUAGES[(LANGUAGES.indexOf(language) + 1) % LANGUAGES.length]!;
  const closeDrawer = () => { if (isPhone()) setOpen(false); };
  const tip = (text: string) => (open ? undefined : text);
  const toggleLabel = open ? t("Minimize menu") : t("Expand menu");
  return (
    <>
      {open && <div className="rail-scrim" aria-hidden="true" onClick={() => setOpen(false)} />}
      <nav className={`explore-rail theme-canopy${solid ? " rail-solid" : ""}${open ? " is-open" : ""}`} aria-label={t("Main navigation")}>
        <a className="explore-brand" href="#/explore" title={tip("Soil Sense")} onClick={closeDrawer}>
          <LogoMark size={40} />
          <span className="er-label">Soil Sense</span>
        </a>
        <button type="button" className="rail-toggle" aria-expanded={open} title={tip(toggleLabel)} onClick={() => setOpen(!open)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
            <path d={open ? "M16 10l-2 2 2 2" : "M14 10l2 2-2 2"} />
          </svg>
          <span className="er-label">{toggleLabel}</span>
        </button>
        {LINKS.slice(0, 3).map(link)}
        {onLayers && (
          <button type="button" title={tip(t("Layers"))} onClick={() => { closeDrawer(); onLayers(); }}>
            <NavIcon kind="layers" />
            <span className="er-label">{t("Layers")}</span>
          </button>
        )}
        {LINKS.slice(3).map(link)}
        <div className="explore-rail-bottom">
          <button type="button" title={LANGUAGE_NAMES[next]} onClick={() => setLanguage(next)}>
            <span className="er-code" aria-hidden="true">{language.toUpperCase()}</span>
            <span className="er-label">{t("Language")}: {LANGUAGE_NAMES[language]}</span>
          </button>
          {user ? (
            <button type="button" title={user.email} onClick={onSignOut}>
              <span className="er-avatar" aria-hidden="true">{user.email.charAt(0).toUpperCase()}</span>
              <span className="er-label er-email">{t("Sign out")} · {user.email}</span>
            </button>
          ) : (
            <a href="#/signin" title={tip(t("Sign in"))} aria-current={here === "#/signin" ? "page" : undefined} onClick={closeDrawer}>
              <NavIcon kind="signin" />
              <span className="er-label">{t("Sign in")}</span>
            </a>
          )}
        </div>
      </nav>
    </>
  );

  function link({ href, kind, label }: (typeof LINKS)[number]) {
    const text = kind === "how-it-works" ? howItWorksCopy.title[language] : kind === "sprout" ? "Sprout" : t(label);
    return (
      <a key={href} href={href} title={tip(text)} aria-current={here === href ? "page" : undefined} onClick={closeDrawer}>
        <NavIcon kind={kind} />
        <span className="er-label">
          {text}
          {kind === "sprout" && <span className="er-tag">{t("AI")}</span>}
        </span>
      </a>
    );
  }
}
