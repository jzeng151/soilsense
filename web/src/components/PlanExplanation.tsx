import { LANGUAGE_LOCALES, type Language } from "../../../src/shared/language";
import { useI18n } from "../i18n";
// Short grounded explanation for one rotation card (#8) with its cited research passages (#7).
// Shows whether the text is live AI output, a saved explanation, or the fixed template, and the as-of date
// of the evidence. Text is keyed to the exact comparison it explains, so changing inputs never leaves a
// stale explanation on screen.

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ExplanationResponse, ResearchResult } from "../../../src/shared/research";
import type { PlanResponse, RotationPlan } from "../../../src/shared/types";
import { fetchExplanation, getLastPlan, subscribeLastPlan } from "../api";
import "./explanation.css";

const sig = (r: RotationPlan) => `${r.id}:${r.years.map((y) => `${y.crop}+${y.cover}`).join(",")}`;

function findIn(plan: PlanResponse | null, rotation: RotationPlan): PlanResponse | null {
  if (!plan) return null;
  const all = [...plan.plans, ...(plan.currentPractice ? [plan.currentPractice] : [])];
  return all.some((p) => sig(p) === sig(rotation)) ? plan : null;
}

const day = (iso: string, language: Language = "en") => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(LANGUAGE_LOCALES[language], { year: "numeric", month: "short", day: "numeric" });
};

const STATUS: Record<ExplanationResponse["status"], { label: string; title: string }> = {
  live: { label: "AI summary", title: "Written just now by Workers AI; every number was checked and filled in from the plan's own facts." },
  saved: { label: "Saved summary", title: "AI could not answer just now, so this is a saved, checked explanation for exactly these inputs." },
  template: { label: "Standard summary", title: "A fixed template built from the plan's facts (no AI)." },
};

function researchLabel(r: ResearchResult): string {
  switch (r.status) {
    case "live":
      return "Retrieved now from our research library";
    case "saved":
      return `Saved research result, retrieved ${r.retrievedAt ? day(r.retrievedAt) : "earlier"}`;
    case "empty":
      return "No matching passage in our small research library for this rotation.";
    default:
      return "Research passages are unavailable right now. The plan and its numbers are unaffected.";
  }
}

function excerpt(text: string, max = 320): { short: string; cut: boolean } {
  if (text.length <= max) return { short: text, cut: false };
  const at = text.lastIndexOf(" ", max);
  return { short: `${text.slice(0, at > 0 ? at : max)}…`, cut: true };
}

export function PlanExplanation({ rotation }: { rotation: RotationPlan }) {
  const { t: tx, text: localize, language } = useI18n();
  const latest = useSyncExternalStore(subscribeLastPlan, getLastPlan, getLastPlan);
  const plan = findIn(latest, rotation);
  const key = plan ? JSON.stringify([plan.request, plan.water, plan.generatedAt, sig(rotation)]) : null;
  const [state, setState] = useState<{ key: string; data?: ExplanationResponse; error?: string } | null>(null);

  useEffect(() => {
    if (!key || !plan) return;
    const ctrl = new AbortController();
    setState({ key });
    fetchExplanation({ ...plan.request, water: plan.water ?? plan.request.water, rotationId: rotation.id }, ctrl.signal)
      .then((data) => setState((s) => (s?.key === key ? { key, data } : s)))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setState((s) => (s?.key === key ? { key, error: e.message } : s));
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!key) return null;
  // Only ever show the explanation for the inputs on screen right now.
  const current = state?.key === key ? state : null;
  const data = current?.data;

  return (
    <section className="px" aria-live="polite" aria-busy={!data && !current?.error}>
      <header className="px-head">
        <h3 className="px-title">{tx("In short")}</h3>
        {data && (
          <span className={`px-badge px-${data.status}`} title={localize(STATUS[data.status].title)}>
            {localize(STATUS[data.status].label)}
          </span>
        )}
      </header>
      {!current?.error && !data && <p className="px-loading">{tx("Writing a short explanation…")}</p>}
      {current?.error && <p className="px-loading">{tx("The short explanation isn't available right now. The plan above is complete.")}</p>}
      {data && (
        <>
          <p className="px-narrative">{data.narrative}</p>
          <p className="px-meta">{tx("Evidence as of")}{" "}{day(data.asOf, language)}{" "}{tx("· weather history")}{" "}{data.evidencePeriod}{" "}{tx("(past observations, not a forecast)")}{data.status === "saved" && data.savedAt ? tx(" · explanation saved {date}", { date: day(data.savedAt, language) }) : ""}
          </p>
          <p className="px-checks">{data.checks}</p>
          <div className="px-research">
            <p className="px-research-status">{data.research.status === "saved" ? tx("Saved research result, retrieved {date}", { date: data.research.retrievedAt ? day(data.research.retrievedAt, language) : tx("earlier") }) : localize(researchLabel(data.research))}</p>
            {data.research.passages.length > 0 && (
              <>
                <ul className="px-passages">
                  {data.research.passages.map((p) => {
                    const e = excerpt(p.text);
                    return (
                      <li key={p.chunkId} id={`px-${p.chunkId}`}>
                        {data.citations.includes(p.chunkId) && <span className="px-cited">{tx("Cited above")}</span>}
                        <blockquote className="px-quote" style={{ whiteSpace: "pre-line" }}>
                          {e.cut ? (
                            <details>
                              <summary>“{e.short}”</summary>“{p.text}”
                            </details>
                          ) : (
                            <>“{p.text}”</>
                          )}
                        </blockquote>
                        <p className="px-source">
                          <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                            {p.sourceTitle}
                          </a>{" "}
                          ({p.year}) · <span title={p.license}>{p.attribution}</span>
                        </p>
                        <p className="px-applies">{tx("Where this applies:")}{" "}{p.applicability}</p>
                      </li>
                    );
                  })}
                </ul>
                <p className="px-note">{tx("Numbers inside quoted research come from those trial plots, not from your field.")}</p>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
