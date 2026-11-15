import { useI18n, translate, translateKnown, type Language } from "../i18n";
import type { ClimateIndicator } from "../../../src/shared/types";

const W = 320;
const H = 130;
const PAD = { l: 34, r: 8, t: 10, b: 22 };

export function trendTone(ind: ClimateIndicator): "up" | "down" | "flat" {
  const v = ind.trend.verdict;
  if (v === "significant_increase") return "up";
  if (v === "significant_decrease") return "down";
  return "flat";
}

export function trendText(ind: ClimateIndicator, language: Language = "en"): string {
  const tone = trendTone(ind);
  if (tone === "flat") return translate(language, "No clear change");
  const a = Math.abs(ind.changePerDecade);
  const n = a >= 10 ? Math.round(a) : Math.round(a * 10) / 10;
  const unit = language === "es" && n === 1 && (ind.unit === "in" || ind.unit === "days") ? translate(language, ind.unit === "in" ? "inch" : "day") : translateKnown(language, ind.unit);
  return translate(language, "{direction} {number} {unit} every 10 years", { direction: translate(language, tone === "up" ? "Up" : "Down"), number: n, unit });
}

export function TrendChart({ ind }: { ind: ClimateIndicator }) {
  const { t: tx, text: localize, language } = useI18n();
  const xs = ind.years;
  const ys = ind.values;
  const x0 = xs[0] ?? 0;
  const x1 = xs[xs.length - 1] ?? 1;
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (hi === lo) hi = lo + 1;
  const padY = (hi - lo) * 0.12;
  lo = Math.max(0, lo - padY);
  hi = hi + padY;
  const X = (x: number) => PAD.l + ((x - x0) / Math.max(1, x1 - x0)) * (W - PAD.l - PAD.r);
  const Y = (y: number) => H - PAD.b - ((y - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${X(x).toFixed(1)},${Y(ys[i] ?? 0).toFixed(1)}`).join("");
  const t = ind.trend;
  const tone = trendTone(ind);
  const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toString() : n.toFixed(1));

  return (
    <figure className="trend">
      <figcaption>
        <span className="trend-title">{localize(ind.label)}</span>
        <span className={`badge badge-${tone}`}>{trendText(ind, language)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tx("{label}, {start} to {end}. {trend}.", { label: localize(ind.label), start: x0, end: x1, trend: trendText(ind, language) })}>
        {[lo, hi].map((tk) => (
          <g key={tk}>
            <line x1={PAD.l} x2={W - PAD.r} y1={Y(tk)} y2={Y(tk)} className="grid" />
            <text x={PAD.l - 5} y={Y(tk) + 3.5} className="axis" textAnchor="end">
              {fmt(tk)}
            </text>
          </g>
        ))}
        {[x0, x1].map((yr) => (
          <text key={yr} x={X(yr)} y={H - 5} className="axis" textAnchor={yr === x0 ? "start" : "end"}>
            {yr}
          </text>
        ))}
        <path d={path} className="series" />
        {xs.map((x, i) => (
          <circle key={x} cx={X(x)} cy={Y(ys[i] ?? 0)} r={1.8} className="dot">
            <title>
              {x}: {ys[i]} {localize(ind.unit)}
            </title>
          </circle>
        ))}
        {tone !== "flat" && (
          <line x1={X(x0)} x2={X(x1)} y1={Y(t.intercept + t.slopePerYear * x0)} y2={Y(t.intercept + t.slopePerYear * x1)} className={`trendline trendline-${tone}`} />
        )}
      </svg>
    </figure>
  );
}
