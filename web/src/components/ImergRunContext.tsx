import type { ImergContext } from "../../../src/shared/imergContext";
import { useI18n } from "../i18n";

export function ImergRunContext({ context }: { context?: ImergContext }) {
  const { t } = useI18n();
  if (!context) return null; // Older persisted runs and historical replays have no IMERG context.
  return <section aria-label={t("IMERG rainfall context")}>
    <h5>{t("IMERG rainfall context")}</h5>
    {context.state === "available" ? <>
      <p>{t("14-day totals ({start} to {end}): IMERG UTC {imerg} mm · POWER LST {power} mm", {
        start: context.start!, end: context.end!, imerg: context.totalMm!.toFixed(2),
        power: context.powerTotalMm == null ? t("unavailable") : context.powerTotalMm.toFixed(2),
      })}</p>
      <p>{t("Same date labels, different UTC/LST day boundaries. Context only; rule v2 still uses POWER. Neither estimate is field truth or agronomic confidence.")}</p>
      <a href={context.bundleUrl}>{t("Accepted IMERG Late V07 snapshot")}</a>{" "}<code>{context.snapshotId}</code>
      <p><a href="https://doi.org/10.5067/GPM/IMERGDL/DAY/07">NASA GES DISC · GPM_3IMERGDL V07 Late · 0.1°</a></p>
    </> : <p>{t(context.state === "stale" ? "Accepted IMERG observations are stale; POWER-only check." : "Accepted IMERG evidence is unavailable; POWER-only check.")}</p>}
  </section>;
}
