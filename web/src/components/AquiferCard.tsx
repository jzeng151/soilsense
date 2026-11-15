import snapshot from '../../../data/aquifer/context.json';
import { aquiferContext } from '../../../src/engine/aquifer';
import { useI18n } from '../i18n';
import { aquiferMessages } from './aquiferMessages';

/** Offline evidence, never fetched on the plan's critical path or passed back into ranking. */
export function AquiferCard({ lat, lon }: { lat: number; lon: number }) {
  const { language } = useI18n();
  const copy = aquiferMessages[language];
  const context = aquiferContext(lat, lon, snapshot);
  const n = (value: number | null) => value === null ? copy.missing : new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
  return <section className="jr-card" style={{ minWidth: 0, overflowWrap: 'anywhere' }} aria-label={copy.title}>
    <h2 className="jr-h2">{copy.title}</h2>
    <p>{copy.scope}</p>
    {context.status === 'available' ? <>
      <p><strong>{copy.section}: {context.sectionId}</strong></p>
      <dl>
        <dt>{copy.thickness}</dt><dd>{n(context.saturatedThicknessFt)} ft</dd>
        <dt>{copy.change}</dt><dd>{n(context.predevelopmentChangeFt)} ft ({n(context.predevelopmentChangePercent)}%)</dd>
        <dt>{copy.decade}</dt><dd>{n(context.decadeWaterLevelChangeFt)} ft</dd>
      </dl>
      <p>{copy.signs}</p><p>{copy.support}</p>
      <p>{copy.district} {n(context.gmd)}.</p><p role="note">{copy.lema}</p>
      <details><summary>{copy.lifetimeTitle}</summary>
        <p>{copy.lifetime}: {n(context.publishedUsableLifetimeYears)} {copy.years}.</p>
        <p>{copy.lifetimeLimit}</p>
      </details>
    </> : <p role="note">{context.status === 'outside-aquifer' ? copy.outside : copy.unavailable}</p>}
    <details><summary>{copy.provenance}</summary>
      <p>{copy.version}</p>
      <p>{copy.retrieved}: {snapshot.retrievedAt}.</p>
      <ul>
        <li><a href={snapshot.sourceLayer}>{copy.kgs}</a></li>
        <li><a href="https://www.kgs.ku.edu/HighPlains/HPA_Atlas/InteractiveAtlas.html">{copy.atlas}</a></li>
        <li><a href="https://kgs.ku.edu/sites/kgs/files/files/PICpdfs/PIC18HighPlainsAquifer2023revision.pdf">{copy.publication}</a></li>
        <li><a href={snapshot.boundary.url}>{copy.boundary}</a></li>
      </ul>
      <p>{copy.audit}: <code>{snapshot.sources.find(s => s.file === 'kgs-finney-section.json')?.sha256}</code></p>
    </details>
  </section>;
}
