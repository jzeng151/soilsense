import { useId, useState } from "react";
import type { DistrictOutlook as Outlook } from "../../../src/shared/districtOutlook";
import { OUTLOOK_LABEL, OUTLOOK_CONTINUE, OUTLOOK_ONSET, OUTLOOK_SKILL, OUTLOOK_REPORT_URL } from "../../../src/shared/districtOutlook";
import type { SecondOpinion } from "../../../src/shared/types";
import { fetchSecondOpinion } from "../api";
import { useI18n } from "../i18n";

/** A separate context line, deliberately outside the rule's status/headline. */
export function DistrictOutlook({ outlook }: { outlook?: Outlook }) {
  const { t } = useI18n();
  const id = useId();
  const [opinion, setOpinion] = useState<SecondOpinion | null>(null);
  const [opened, setOpened] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!outlook || !/^20\d{3}$/.test(outlook.fips) || !["watch", "warning"].includes(outlook.alert)) return null;
  async function openOpinion() {
    setOpened(true);
    setFailed(false);
    try { setOpinion(await fetchSecondOpinion(outlook!.fips)); } catch { setFailed(true); }
  }
  return <div className="fw-outlook">
    <p><strong>{t(OUTLOOK_LABEL)}</strong>: {t(outlook.situation === "continue" ? OUTLOOK_CONTINUE : OUTLOOK_ONSET)}</p>
    <details>
      <summary>{t("Why this outlook?")}</summary>
      <p>{t(OUTLOOK_SKILL)} <a href={OUTLOOK_REPORT_URL} target="_blank" rel="noreferrer">{t("Model backtest report")}</a></p>
      <p>{t("Model data through {date}", { date: outlook.dataThrough })} · <a href={outlook.source.url}>{outlook.source.name}</a></p>
      <p>{t("County Drought Monitor map: {date}", { date: outlook.usdm.validStart })} · <a href={outlook.usdm.sourceUrl}>{t("U.S. Drought Monitor")}</a></p>
    </details>
    {outlook.dryYearRanking && <p><a href={`#${id}`} onClick={(event) => { event.preventDefault(); void openOpinion(); }} aria-expanded={opened} aria-controls={id}>{t("K-State rotations for this county are ranked for a dry year")}</a></p>}
    {outlook.dryYearRanking && <div id={id} hidden={!opened} className="jr-card" tabIndex={-1}>
      <h3>{t("Second opinion")}</h3>
      <p>{t("Separate Kansas model; rain-fed rotations, not a change to Field Watch status.")}</p>
      {failed ? <p role="status">{t("County rotations unavailable. Try the link again.")}</p> : !opinion ? <p role="status">{t("Loading county rotations…")}</p> : <>
        <p>{opinion.county} · {t("Model data through {date}", { date: opinion.dataThrough })}</p>
        <ol>{opinion.rotations.map((r) => <li key={r.code}>{r.name}</li>)}</ol>
        <p>{opinion.basis}</p>
        {opinion.savedCopy && <p>{t("Using a saved copy.")}</p>}
        <a href={opinion.sourceUrl}>{opinion.source}</a>
      </>}
    </div>}
  </div>;
}
