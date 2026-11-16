import { GoalScore } from "./GoalPicker";
import { useI18n, cropName, coverNames } from "../i18n";
import { Definition } from "./Glossary";
import type { CropId, RotationPlan } from "../../../src/shared/types";
import { LANGUAGE_LOCALES, type Language } from "../../../src/shared/language";
import { PlanExplanation } from "./PlanExplanation";

const localizedCoverNames = {
  es: coverNames,
  "zh-Hans": { cereal_rye: "黑麦", crimson_clover: "绛三叶", hairy_vetch: "毛叶苕子", none: "无覆盖作物" },
  ko: { cereal_rye: "호밀", crimson_clover: "크림슨클로버", hairy_vetch: "헤어리베치", none: "피복작물 없음" },
};

function coverName(year: RotationPlan["years"][number], language: Language): string {
  return language === "en" ? year.coverName : localizedCoverNames[language][year.cover] ?? year.coverName;
}

// Crop colors live in tokens.css (--crop-*); these are CSS values for style props.
export const CROP_COLORS: Record<CropId, string> = {
  corn: "var(--crop-corn)",
  soybean: "var(--crop-soybean)",
  winter_wheat: "var(--crop-winter-wheat)",
  oats: "var(--crop-oats)",
  alfalfa: "var(--crop-alfalfa)",
  sorghum: "var(--crop-sorghum)",
  fallow: "var(--crop-fallow)",
};

/** Plain words for a yearly net return: near zero reads as "about break-even", not "−$5". */
export function profitWords(n: number): string {
  if (Math.abs(n) < 15) return "about break-even";
  return n < 0 ? `loses about ${money(-n)}` : money(n);
}

export function money(n: number, language: Language = "en"): string {
  return `${n < 0 ? "−" : ""}$${new Intl.NumberFormat(LANGUAGE_LOCALES[language]).format(Math.abs(Math.round(n)))}`;
}

function DeltaTag({ delta }: { delta: number }) {
  const { t, language } = useI18n();
  if (Math.abs(delta) < 1) return <span className="delta delta-flat">{t("Same as now")}</span>;
  return <span className={`delta ${delta > 0 ? "delta-up" : "delta-down"}`}>{delta > 0 ? `+${money(delta, language)}` : money(delta, language)} {t("vs. now")}</span>;
}

/** The big recommended plan at the top of the results. */
export function TopPlan({ plan, compareTo, summary }: { plan: RotationPlan; compareTo: RotationPlan | null; summary?: string }) {
  const { t, language } = useI18n();
  const numbers = new Intl.NumberFormat(LANGUAGE_LOCALES[language]);
  const delta = compareTo ? plan.avgNetReturnPerAcre - compareTo.avgNetReturnPerAcre : null;
  return (
    <article className="top-plan">
      <ol className="years">
        {plan.years.map((y) => (
          <li key={y.year} style={{ ["--crop" as string]: CROP_COLORS[y.crop] }}>
            <span className="years-year">{y.year}</span>
            <span className="years-crop">{cropName(y.crop, language)}</span>
            <span className="years-cover">{y.cover === "none" ? t("No cover crop") : t("+ {cover} over winter", { cover: coverName(y, language) })}</span>
          </li>
        ))}
      </ol>
      <dl className="top-stats">
        <div>
          <dt>{language !== "en" ? t("Net margin") : <Definition term="margin" />}</dt>
          <dd>
            <span className={Math.abs(plan.avgNetReturnPerAcre) < 15 || plan.avgNetReturnPerAcre < 0 ? "stat-words" : undefined}>{Math.abs(plan.avgNetReturnPerAcre) < 15 ? t("about break-even") : plan.avgNetReturnPerAcre < 0 ? t("loses about {money}", { money: money(-plan.avgNetReturnPerAcre, language) }) : money(plan.avgNetReturnPerAcre, language)}</span>
            {Math.abs(plan.avgNetReturnPerAcre) >= 15 && <small>{t("/acre/year")}</small>}
          </dd>
        </div>
        {delta !== null && (
          <div>
            <dt>{t("Compared with now")}</dt>
            <dd>
              <DeltaTag delta={delta} />
            </dd>
          </div>
        )}
        <div>
          <dt>{t("Bad years")}</dt>
          <dd>
            {numbers.format(plan.badYearsIn10)}
            <small>{t(" in 10")}</small>
          </dd>
        </div>
        <div>
          <dt>{t("Cover crops")}</dt>
          <dd>
            {numbers.format(plan.coverYears)} {t("of 3")}<small>{t(" winters")}</small>
          </dd>
        </div>
      </dl>
      <GoalScore plan={plan} />
      {language !== "en" && summary ? <section className="px"><h3 className="px-title">{t("In short")}</h3><p className="px-narrative">{summary}</p></section> : <PlanExplanation rotation={plan} />}
    </article>
  );
}

/** One compact row in the "other options" list. */
export function PlanRow({ plan, title, compareTo, muted }: { plan: RotationPlan; title: string; compareTo?: RotationPlan | null; muted?: boolean }) {
  const { t, language } = useI18n();
  const numbers = new Intl.NumberFormat(LANGUAGE_LOCALES[language]);
  const delta = compareTo ? plan.avgNetReturnPerAcre - compareTo.avgNetReturnPerAcre : null;
  return (
    <li className={`plan-row ${muted ? "plan-row-muted" : ""}`}>
      <span className="plan-row-title">{title}</span>
      <span className="chips">
        {plan.years.map((y) => (
          <span key={y.year} className="chip" style={{ background: CROP_COLORS[y.crop] }} title={`${y.year}: ${cropName(y.crop, language)}${y.cover !== "none" ? ` + ${coverName(y, language)}` : ""}`}>
            {cropName(y.crop, language)}
          </span>
        ))}
      </span>
      <span className="plan-row-money">
        {money(plan.avgNetReturnPerAcre, language)}
        <small>{language === "en" ? "/acre/yr" : t("/acre/year")}</small>
        <span className="plan-row-bad">{numbers.format(plan.badYearsIn10)}/10 {t("Bad years").toLowerCase()}</span>
        {delta !== null && <DeltaTag delta={delta} />}
      </span>
      <GoalScore plan={plan} />
    </li>
  );
}
