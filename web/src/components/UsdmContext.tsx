import { useI18n } from "../i18n";
// Weekly U.S. Drought Monitor context beside the bad-year replay (GitHub issue #31).
// Regional county context only: it never changes a score and is not a field measurement.

import { useEffect, useState } from "react";
import type { PlanResponse, UsdmCategory, UsdmTimeline } from "../../../src/shared/types";
import { fetchUsdmReplay } from "../api";
import "./usdm.css";

// Official USDM legend colours.
const COLORS: Record<UsdmCategory, string> = { none: "#e9eee4", D0: "#ffff00", D1: "#fcd37f", D2: "#ffaa00", D3: "#e60000", D4: "#730000" };
const NAMES: Record<UsdmCategory, string> = {
  none: "No drought",
  D0: "D0 abnormally dry",
  D1: "D1 moderate drought",
  D2: "D2 severe drought",
  D3: "D3 extreme drought",
  D4: "D4 exceptional drought",
};
const ORDER: UsdmCategory[] = ["none", "D0", "D1", "D2", "D3", "D4"];

function Strip({ t }: { t: UsdmTimeline }) {
  const { t: tx, text: localize } = useI18n();
  const cells = [
    ...t.weeks.map((w) => ({ date: w.validStart, w })),
    ...t.missingWeeks.map((date) => ({ date, w: null })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="usdm-strip" role="list" aria-label={tx("USDM weeks {start} to {end}", { start: t.window.start, end: t.window.end })}>
      {cells.map(({ date, w }) =>
        w ? (
          <a
            key={date}
            role="listitem"
            href={w.mapUrl}
            target="_blank"
            rel="noreferrer"
            className={`usdm-cell ${w.mixed ? "mixed" : ""}`}
            style={{ background: COLORS[w.predominant] }}
            title={tx("Map valid {date}: {categories}{boundary}", { date: w.validStart, categories: ORDER.filter((c) => w.pct[c] > 0).map((c) => `${localize(NAMES[c])} ${w.pct[c]}%`).join(", "), boundary: w.mixed ? tx(" (category boundary crosses the county)") : "" })}
          />
        ) : (
          <span key={date} role="listitem" className="usdm-cell missing" title={tx("Map valid {date}: unavailable (not counted as no drought)", { date })} />
        ),
      )}
    </div>
  );
}

export function UsdmContext({ plan }: { plan: PlanResponse }) {
  const { t: tx, text: localize, language } = useI18n();
  const fips = plan.location.county?.countyFips ?? null;
  const years = (plan.droughtReplays ?? []).map((r) => r.year);
  const yearsKey = years.join(",");
  const [data, setData] = useState<UsdmTimeline[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fips || !yearsKey) return;
    const ctrl = new AbortController();
    setData(null);
    setError(null);
    fetchUsdmReplay(fips, yearsKey.split(",").map(Number), ctrl.signal)
      .then((r) => setData(r.timelines))
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "USDM context unavailable");
      });
    return () => ctrl.abort();
  }, [fips, yearsKey]);

  if (!fips || !years.length) return null;
  const src = data?.[0]?.source;
  return (
    <div className="jr-card usdm-card">
      <h2 className="jr-h2">{tx("Drought Monitor in those years")}</h2>
      <p className="usdm-lead">{tx("Weekly U.S. Drought Monitor category for the county, May–Sep (the same window as the replay's weather). Regional context, not a reading from your field, and it does not change any score.")}</p>
      {error && <p className="usdm-note">{tx("USDM context unavailable:")}{" "}{localize(error)}</p>}
      {!data && !error && <p className="usdm-note">{tx("Loading Drought Monitor weeks…")}</p>}
      {data?.map((t) => (
        <div key={t.window.start} className="usdm-year">
          <div className="usdm-year-head">
            <b>{t.window.start.slice(0, 4)}</b>
            <span>
              {t.observedWeeks}{" "}{tx("of")}{" "}{t.expectedWeeks}{" "}{tx("weeks observed")}{t.mixedWeeks > 0 ? tx(" · {count} split by a category boundary", { count: t.mixedWeeks }) : ""}
            </span>
          </div>
          {t.observedWeeks > 0 || t.missingWeeks.length > 0 ? <Strip t={t} /> : null}
          <p className="usdm-note">{language === "en" ? t.agreement?.text ?? t.note : t.observedWeeks === 0
            ? tx(t.window.end < "2000-01-01" ? "No USDM context: the U.S. Drought Monitor starts in January 2000." : "USDM data unavailable for this county and period.")
            : t.agreement?.kind === "no-drought"
              ? tx("USDM showed no drought over most of the county in all {observed} observed weeks: this bad year was likely driven by something else (heat, timing, excess water) or local conditions.", { observed: t.observedWeeks })
              : tx("USDM drought (D1–D4) covered most of the county in {drought} of {observed} observed weeks; abnormally dry (D0) in {dry}. Missing weeks: {missing}; not counted as no drought.", { drought: t.droughtWeeks, observed: t.observedWeeks, dry: t.counts.D0, missing: t.missingWeeks.length })}</p>
          {t.observedWeeks > 0 && (
            <p className="usdm-counts">
              {ORDER.filter((c) => t.counts[c] > 0)
                .map((c) => `${localize(NAMES[c])}: ${t.counts[c]} ${tx("wk")}`)
                .join(" · ")}
            </p>
          )}
        </div>
      ))}
      <ul className="usdm-legend" aria-label={tx("USDM legend")}>
        {ORDER.map((c) => (
          <li key={c}>
            <span className="usdm-cell" style={{ background: COLORS[c] }} /> {localize(NAMES[c])}
          </li>
        ))}
        <li>
          <span className="usdm-cell missing" />{" "}{tx("No map (unavailable)")}</li>
      </ul>
      <p className="usdm-attrib">{tx("Each square is one weekly map (colour = category covering most of the county; striped = split by a category boundary). Click a square for that week's official state map.")}{" "}{src ? tx("Retrieved {date} from the ", { date: src.retrievedAt.slice(0, 10) }) : tx("Source: the ")}
        <a href={src?.docsUrl ?? "https://droughtmonitor.unl.edu/DmData/DataDownload/WebServiceInfo.aspx"} target="_blank" rel="noreferrer">{tx("USDM data services (county statistics, categorical)")}</a>{tx(". The U.S. Drought Monitor is jointly produced by the National Drought Mitigation Center at the University of Nebraska-Lincoln, the U.S. Department of Agriculture, the National Oceanic and Atmospheric Administration and NASA. Data courtesy of NDMC, via")}{" "}
        <a href="https://droughtmonitor.unl.edu" target="_blank" rel="noreferrer">
          droughtmonitor.unl.edu
        </a>
        .
      </p>
    </div>
  );
}
