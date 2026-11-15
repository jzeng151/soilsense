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
  const cells = [
    ...t.weeks.map((w) => ({ date: w.validStart, w })),
    ...t.missingWeeks.map((date) => ({ date, w: null })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="usdm-strip" role="list" aria-label={`USDM weeks ${t.window.start} to ${t.window.end}`}>
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
            title={`Map valid ${w.validStart}: ${ORDER.filter((c) => w.pct[c] > 0)
              .map((c) => `${NAMES[c]} ${w.pct[c]}%`)
              .join(", ")}${w.mixed ? " (category boundary crosses the county)" : ""}`}
          />
        ) : (
          <span key={date} role="listitem" className="usdm-cell missing" title={`Map valid ${date}: unavailable (not counted as no drought)`} />
        ),
      )}
    </div>
  );
}

export function UsdmContext({ plan }: { plan: PlanResponse }) {
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
      <h2 className="jr-h2">Drought Monitor in those years</h2>
      <p className="usdm-lead">
        Weekly U.S. Drought Monitor category for the county, May–Sep (the same window as the replay's weather). Regional context, not a
        reading from your field, and it does not change any score.
      </p>
      {error && <p className="usdm-note">USDM context unavailable: {error}</p>}
      {!data && !error && <p className="usdm-note">Loading Drought Monitor weeks…</p>}
      {data?.map((t) => (
        <div key={t.window.start} className="usdm-year">
          <div className="usdm-year-head">
            <b>{t.window.start.slice(0, 4)}</b>
            <span>
              {t.observedWeeks} of {t.expectedWeeks} weeks observed
              {t.mixedWeeks > 0 ? ` · ${t.mixedWeeks} split by a category boundary` : ""}
            </span>
          </div>
          {t.observedWeeks > 0 || t.missingWeeks.length > 0 ? <Strip t={t} /> : null}
          <p className="usdm-note">{t.agreement?.text ?? t.note}</p>
          {t.observedWeeks > 0 && (
            <p className="usdm-counts">
              {ORDER.filter((c) => t.counts[c] > 0)
                .map((c) => `${NAMES[c]}: ${t.counts[c]} wk`)
                .join(" · ")}
            </p>
          )}
        </div>
      ))}
      <ul className="usdm-legend" aria-label="USDM legend">
        {ORDER.map((c) => (
          <li key={c}>
            <span className="usdm-cell" style={{ background: COLORS[c] }} /> {NAMES[c]}
          </li>
        ))}
        <li>
          <span className="usdm-cell missing" /> No map (unavailable)
        </li>
      </ul>
      <p className="usdm-attrib">
        Each square is one weekly map (colour = category covering most of the county; striped = split by a category boundary). Click a
        square for that week's official state map. {src ? `Retrieved ${src.retrievedAt.slice(0, 10)} from the ` : "Source: the "}
        <a href={src?.docsUrl ?? "https://droughtmonitor.unl.edu/DmData/DataDownload/WebServiceInfo.aspx"} target="_blank" rel="noreferrer">
          USDM data services (county statistics, categorical)
        </a>
        . The U.S. Drought Monitor is jointly produced by the National Drought Mitigation Center at the University of Nebraska-Lincoln, the
        U.S. Department of Agriculture, the National Oceanic and Atmospheric Administration and NASA. Data courtesy of NDMC, via{" "}
        <a href="https://droughtmonitor.unl.edu" target="_blank" rel="noreferrer">
          droughtmonitor.unl.edu
        </a>
        .
      </p>
    </div>
  );
}
