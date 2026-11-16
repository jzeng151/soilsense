import { howItWorksCopy, useI18n } from "../../i18n";
import { LogoMark } from "../Logo";
import { NavIcon, type NavIconKind } from "../NavIcons";
import { LANGUAGE_NAMES, LANGUAGES } from "../../../../src/shared/language";

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

/** Icon rail for Explore and Demo. Same icons as the planner sidebar; hovering or focusing it expands to show the labels.
 *  Labels are always in the DOM (clipped while collapsed), so every control's accessible name is its visible text. */
export function ExploreRail({ onLayers }: { onLayers?: () => void }) {
  const { t, language, setLanguage } = useI18n();
  const here = typeof window === "undefined" ? "" : window.location.hash.split("?")[0];
  const next = LANGUAGES[(LANGUAGES.indexOf(language) + 1) % LANGUAGES.length]!;
  return (
    <nav className="explore-rail theme-canopy" aria-label={t("Main navigation")}>
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
        <a href="#/signin">
          <NavIcon kind="signin" />
          <span className="er-label">{t("Sign in")}</span>
        </a>
      </div>
    </nav>
  );

  function link({ href, kind, label }: (typeof LINKS)[number]) {
    const text = kind === "how-it-works" ? howItWorksCopy.title[language] : kind === "sprout" ? "Sprout" : t(label);
    return (
      <a key={href} href={href} aria-current={here === href ? "page" : undefined}>
        <NavIcon kind={kind} />
        <span className="er-label">{text}</span>
      </a>
    );
  }
}
