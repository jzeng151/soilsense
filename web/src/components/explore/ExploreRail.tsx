import { createContext, useContext } from "react";
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

/** The app-wide navigation rail (Explore, Demo and every other page). Hovering or focusing it expands to show the labels.
 *  Labels are always in the DOM (clipped while collapsed), so every control's accessible name is its visible text.
 *  `solid` is for pages without a map behind the rail; `current` overrides the hash-derived active link. */
export function ExploreRail({ onLayers, solid = false, current }: { onLayers?: () => void; solid?: boolean; current?: RailHref | null }) {
  const { t, language, setLanguage } = useI18n();
  const { user, onSignOut } = useContext(NavAccountContext);
  const here = current !== undefined ? current : typeof window === "undefined" ? "" : window.location.hash.split("?")[0];
  const next = LANGUAGES[(LANGUAGES.indexOf(language) + 1) % LANGUAGES.length]!;
  return (
    <nav className={`explore-rail theme-canopy${solid ? " rail-solid" : ""}`} aria-label={t("Main navigation")}>
      <a className="explore-brand" href="#/explore">
        <LogoMark size={40} />
        <span className="er-label">Soil Sense</span>
      </a>
      {LINKS.slice(0, 3).map(link)}
      {onLayers && (
        <button type="button" onClick={onLayers}>
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
          <a href="#/signin" aria-current={here === "#/signin" ? "page" : undefined}>
            <NavIcon kind="signin" />
            <span className="er-label">{t("Sign in")}</span>
          </a>
        )}
      </div>
    </nav>
  );

  function link({ href, kind, label }: (typeof LINKS)[number]) {
    const text = kind === "how-it-works" ? howItWorksCopy.title[language] : kind === "sprout" ? "Sprout" : t(label);
    return (
      <a key={href} href={href} aria-current={here === href ? "page" : undefined}>
        <NavIcon kind={kind} />
        <span className="er-label">
          {text}
          {kind === "sprout" && <span className="er-tag">{t("AI")}</span>}
        </span>
      </a>
    );
  }
}
