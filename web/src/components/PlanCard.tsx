import type { CropId, RotationPlan } from "../../../src/shared/types";

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

export function money(n: number): string {
  return `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}

function DeltaTag({ delta }: { delta: number }) {
  if (Math.abs(delta) < 1) return <span className="delta delta-flat">Same as now</span>;
  return <span className={`delta ${delta > 0 ? "delta-up" : "delta-down"}`}>{delta > 0 ? `+${money(delta)}` : money(delta)} vs. now</span>;
}

/** The big recommended plan at the top of the results. */
export function TopPlan({ plan, compareTo }: { plan: RotationPlan; compareTo: RotationPlan | null }) {
  const delta = compareTo ? plan.avgNetReturnPerAcre - compareTo.avgNetReturnPerAcre : null;
  return (
    <article className="top-plan">
      <ol className="years">
        {plan.years.map((y) => (
          <li key={y.year} style={{ ["--crop" as string]: CROP_COLORS[y.crop] }}>
            <span className="years-year">{y.year}</span>
            <span className="years-crop">{y.cropName}</span>
            <span className="years-cover">{y.cover === "none" ? "No cover crop" : `+ ${y.coverName} over winter`}</span>
          </li>
        ))}
      </ol>
      <dl className="top-stats">
        <div>
          <dt>Estimated profit</dt>
          <dd>
            {money(plan.avgNetReturnPerAcre)}
            <small>/acre/year</small>
          </dd>
        </div>
        {delta !== null && (
          <div>
            <dt>Compared with now</dt>
            <dd>
              <DeltaTag delta={delta} />
            </dd>
          </div>
        )}
        <div>
          <dt>Cover crops</dt>
          <dd>
            {plan.coverYears} of 3<small> winters</small>
          </dd>
        </div>
      </dl>
    </article>
  );
}

/** One compact row in the "other options" list. */
export function PlanRow({ plan, title, compareTo, muted }: { plan: RotationPlan; title: string; compareTo?: RotationPlan | null; muted?: boolean }) {
  const delta = compareTo ? plan.avgNetReturnPerAcre - compareTo.avgNetReturnPerAcre : null;
  return (
    <li className={`plan-row ${muted ? "plan-row-muted" : ""}`}>
      <span className="plan-row-title">{title}</span>
      <span className="chips">
        {plan.years.map((y) => (
          <span key={y.year} className="chip" style={{ background: CROP_COLORS[y.crop] }} title={`${y.year}: ${y.cropName}${y.cover !== "none" ? ` + ${y.coverName}` : ""}`}>
            {y.cropName}
          </span>
        ))}
      </span>
      <span className="plan-row-money">
        {money(plan.avgNetReturnPerAcre)}
        <small>/acre/yr</small>
        {delta !== null && <DeltaTag delta={delta} />}
      </span>
    </li>
  );
}
