import { FieldWatchCard } from "../components/FieldWatchCard";
import { MyFieldsPanel } from "../components/MyFieldsPanel";
import { useI18n } from "../i18n";
import "./field-watch.css";

/** Monitoring only. Rotation planning lives in Explore and never starts on this page. */
export function FieldWatchPage() {
  const { t } = useI18n();
  return <main className="app jr field-watch-page" aria-labelledby="field-watch-heading">
    <header className="topbar"><h1 id="field-watch-heading">{t("Field Watch")}</h1></header>
    <p>{t("Monitor saved fields, review recent checks and manage automatic watches. Plan crop rotations in Explore.")}</p>
    <a className="primary" href="#/explore">{t("Explore")}</a>
    <MyFieldsPanel fields={[]} />
    <FieldWatchCard />
  </main>;
}
