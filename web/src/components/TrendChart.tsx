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

export function trendText(ind: ClimateIndicator): string {
  const tone = trendTone(ind);
  if (tone === "flat") return "No clear change";
  const a = Math.abs(ind.changePerDecade);
  const n = a >= 10 ? Math.round(a) : Math.round(a * 10) / 10;
  return `${tone === "up" ? "Up" : "Down"} ${n} ${ind.unit} every 10 years`;
}

/** WCAG 1.1.1: what the chart shows, in words (trend plus the lowest and highest years). */
function describe(ind: ClimateIndicator): string {
  const ys = ind.values;
  const xs = ind.years;
  if (!ys.length) return ind.label;
  const iMin = ys.indexOf(Math.min(...ys));
  const iMax = ys.indexOf(Math.max(...ys));
  const f = (n: number) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10);
  return `${ind.label}, ${xs[0]} to ${xs[xs.length - 1]}. ${trendText(ind)}. Lowest ${f(ys[iMin]!)} ${ind.unit} in ${xs[iMin]}, highest ${f(ys[iMax]!)} ${ind.unit} in ${xs[iMax]}.`;
}

export function TrendChart({ ind }: { ind: ClimateIndicator }) {
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
        <span className="trend-title">{ind.label}</span>
        <span className={`badge badge-${tone}`}>{trendText(ind)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={describe(ind)}>
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
              {x}: {ys[i]} {ind.unit}
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
