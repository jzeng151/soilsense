import { GoalScore } from "./GoalPicker";
import { useI18n, cropName, coverNames } from "../i18n";
import { Definition } from "./Glossary";
import "./prices.css";
import type { CropId, PlanYear, RotationPlan } from "../../../src/shared/types";
import { PlanExplanation } from "./PlanExplanation";
import { FertilizerGuide } from "./FertilizerGuide";

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

export function money(n: number): string {
  return `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}

function DeltaTag({ delta }: { delta: number }) {
  const { t } = useI18n();
  if (Math.abs(delta) < 1) return <span className="delta delta-flat">{t("Same as now")}</span>;
  return <span className={`delta ${delta > 0 ? "delta-up" : "delta-down"}`}>{delta > 0 ? `+${money(delta)}` : money(delta)} {t("vs. now")}</span>;
}

function YearEconomics({ year }: { year: PlanYear }) {
  const { t } = useI18n();
  return <dl className="year-economics">
    <div><dt>{t("Expected yield")}</dt><dd>{year.crop==="fallow" ? t("No harvest") : `${year.expectedYield} ${t(year.yieldUnit.startsWith("tons") ? "US short tons/acre" : "bu/acre")}`}</dd></div>
    <div><dt>{t("Net $/acre")}</dt><dd>{money(year.netReturnPerAcre)}</dd></div>
  </dl>;
}

/** The big recommended plan at the top of the results. */
export function TopPlan({ plan, compareTo, summary }: { plan: RotationPlan; compareTo: RotationPlan | null; summary?: string }) {
  const { t, language } = useI18n();
  const delta = compareTo ? plan.avgNetReturnPerAcre - compareTo.avgNetReturnPerAcre : null;
  return (
    <article className="top-plan">
      <ol className="years">
        {plan.years.map((y) => (
          <li key={y.year} style={{ ["--crop" as string]: CROP_COLORS[y.crop] }}>
            <span className="years-year">{y.year}</span>
            <span className="years-crop">{cropName(y.crop, language)}</span>
            <YearEconomics year={y} />
            <span className="years-cover">{y.cover === "none" ? t("No cover crop") : t("+ {cover} over winter", { cover: language === "es" ? coverNames[y.cover] ?? y.coverName : y.coverName })}</span>
          </li>
        ))}
      </ol>
      <dl className="top-stats">
        <div>
          <dt>{language === "es" ? t("Net margin") : <Definition term="margin" />}</dt>
          <dd>
            <span className={Math.abs(plan.avgNetReturnPerAcre) < 15 || plan.avgNetReturnPerAcre < 0 ? "stat-words" : undefined}>{Math.abs(plan.avgNetReturnPerAcre) < 15 ? t("about break-even") : plan.avgNetReturnPerAcre < 0 ? t("loses about {money}", { money: money(-plan.avgNetReturnPerAcre) }) : money(plan.avgNetReturnPerAcre)}</span>
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
            {plan.badYearsIn10}
            <small>{t(" in 10")}</small>
          </dd>
        </div>
        <div>
          <dt>{t("Cover crops")}</dt>
          <dd>
            {plan.coverYears} {t("of 3")}<small>{t(" winters")}</small>
          </dd>
        </div>
      </dl>
      <GoalScore plan={plan} />
      <FertilizerGuide fertilizer={plan.fertilizer} />
      {language === "es" && summary ? <section className="px"><h3 className="px-title">{t("In short")}</h3><p className="px-narrative">{summary}</p></section> : <PlanExplanation rotation={plan} />}
    </article>
  );
}

/** One compact row in the "other options" list. */
export function PlanRow({ plan, title, compareTo, muted }: { plan: RotationPlan; title: string; compareTo?: RotationPlan | null; muted?: boolean }) {
  const { t, language } = useI18n();
  const delta = compareTo ? plan.avgNetReturnPerAcre - compareTo.avgNetReturnPerAcre : null;
  return (
    <li className={`plan-row ${muted ? "plan-row-muted" : ""}`}>
      <span className="plan-row-title">{title}</span>
      <span className="chips">
        {plan.years.map((y) => (
          <span key={y.year} className="chip" style={{ background: CROP_COLORS[y.crop] }} title={`${y.year}: ${cropName(y.crop, language)}${y.cover !== "none" ? ` + ${language === "es" ? coverNames[y.cover] : y.coverName}` : ""}`}>
            {cropName(y.crop, language)}
          </span>
        ))}
      </span>
      <span className="plan-row-money">
        {money(plan.avgNetReturnPerAcre)}
        <small>/acre/{language === "es" ? "año" : "yr"}</small>
        <span className="plan-row-bad">{plan.badYearsIn10}/10 {t("Bad years").toLowerCase()}</span>
        {delta !== null && <DeltaTag delta={delta} />}
      </span>
      <ul className="plan-year-details">{plan.years.map(y=><li key={y.year}><strong>{y.year} · {cropName(y.crop,language)}</strong><YearEconomics year={y}/></li>)}</ul>
      <GoalScore plan={plan} />
      <FertilizerGuide fertilizer={plan.fertilizer} />
    </li>
  );
}
