import { useId } from "react";
import { howItWorksCopy as copy, howItWorksSources, useI18n, type Language } from "../i18n";
import { cloudflareProducts } from "./cloudflare-products";
import "./how-it-works.css";

const repo = "https://github.com/jzeng151/soilsense/blob/next/";

/** Same entry / features / background / ingestion / storage structure as the reference diagram.
 * Separate SVG panels keep labels readable instead of shrinking a desktop canvas on a phone.
 */
function Flow({ index, language }: { index: number; language: Language }) {
  const id = useId();
  const nodes = copy.flows[index]!;
  const title = copy.flowTitles[index]![language];
  // The public API fans out to independent features; Cron fans out to independent jobs.
  const edges: [number, number][] = index === 0
    ? [[0, 1], [0, 2], [2, 3], [2, 4], [2, 5], [2, 6], [4, 7], [5, 7], [6, 8], [5, 8], [3, 9], [4, 9]]
    : index === 1 ? [[0, 1], [1, 2], [0, 3], [3, 4], [4, 5], [1, 6]]
    : nodes.slice(1).map((_, i) => [i, i + 1]);
  return <div className="hiw-flow">
    <h3>{title}</h3>
    <svg viewBox={`0 0 340 ${nodes.length * 78}`} role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-desc`}>
      <title id={`${id}-title`}>{title}</title>
      <desc id={`${id}-desc`}>{copy.flowDescriptions[index]![language]}</desc>
      <defs><marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 10 5 0 10z" className="hiw-arrow" /></marker></defs>
      <g className="hiw-edges" markerEnd={`url(#${id}-arrow)`}>
        {edges.map(([from, to], i) => {
          const start = from * 78 + 62, end = to * 78 + 10;
          const side = i % 2 ? 330 : 10;
          return <path key={`${from}-${to}`} d={to === from + 1 ? `M170 ${start}V${end}` : `M${side === 10 ? 24 : 316} ${start - 26}H${side}V${end + 26}H${side === 10 ? 22 : 318}`} />;
        })}
      </g>
      {nodes.map((node, i) => <g key={node.en}>
        <rect x="24" y={i * 78 + 10} width="292" height="52" rx="10" className={index === 2 && i === 5 ? "hiw-review" : ""} />
        <text x="170" y={i * 78 + 41} textAnchor="middle">{node[language]}</text>
      </g>)}
    </svg>
  </div>;
}

export function HowItWorksPage() {
  const { language, setLanguage, t } = useI18n();
  const text = (value: Record<Language, string>) => value[language];
  return <div className="app hiw">
    <main className="hiw-wrap">
      <header className="hiw-head">
        <div className="hiw-language" role="group" aria-label={t("Language")}>
          <button type="button" lang="en" aria-label="English" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>English</button>
          <button type="button" lang="es" aria-label="Español" aria-pressed={language === "es"} onClick={() => setLanguage("es")}>Español</button>
          <button type="button" lang="ko" aria-label="한국어" aria-pressed={language === "ko"} onClick={() => setLanguage("ko")}>한국어</button>
        </div>
        <p className="eyebrow">SoilSense · NASA Space Apps 2026</p>
        <h1>{text(copy.title)}</h1>
        <p className="intro-lead">{text(copy.intro)}</p>
      </header>
      <section aria-labelledby="hiw-architecture">
        <h2 id="hiw-architecture">{text(copy.architecture)}</h2>
        <figure>
          <div className="hiw-diagram">{copy.flows.map((_, i) => <Flow key={i} index={i} language={language} />)}</div>
          <figcaption>{text(copy.diagramNote)}</figcaption>
        </figure>
        <details><summary>{text(copy.textAlternative)}</summary><p>{text(copy.flowAlternative)}</p></details>
      </section>
      <section aria-labelledby="hiw-products">
        <h2 id="hiw-products">{text(copy.products)}</h2>
        <table className="hiw-table">
          <caption>{text(copy.productCaption)} <a href={`${repo}wrangler.jsonc`}>wrangler.jsonc</a> · <a href={`${repo}docs/INGEST.md`}>INGEST.md</a></caption>
          <thead><tr><th scope="col">{text(copy.product)}</th><th scope="col">{text(copy.use)}</th></tr></thead>
          <tbody>{cloudflareProducts.map(product => <tr key={product.key}><th scope="row"><span>{product.name}</span>{product.bindings.map(binding => <code className="hiw-binding" key={binding}>{binding}</code>)}</th><td>{text(product.description)}</td></tr>)}</tbody>
        </table>
      </section>
      <section aria-labelledby="hiw-sources">
        <h2 id="hiw-sources">{text(copy.sources)}</h2>
        <table className="hiw-table">
          <caption>{text(copy.sourcesIntro)}</caption>
          <thead><tr><th scope="col">{text(copy.source)}</th><th scope="col">{text(copy.use)}</th><th scope="col">{text(copy.limits)}</th></tr></thead>
          <tbody>{howItWorksSources.map(source => <tr key={source.name}><th scope="row"><a href={source.url}>{source.name}</a></th><td>{text(source.use)}</td><td>{text(source.limits)}</td></tr>)}</tbody>
        </table>
        <p className="hiw-links"><a href="https://www.usgs.gov/programs/national-geospatial-program/national-map">USGS National Map</a> · <a href="https://www.openstreetmap.org/">OpenStreetMap</a> · <a href={`${repo}docs/RESEARCH.md`}>RESEARCH.md</a></p>
      </section>
      <section aria-labelledby="hiw-validation">
        <h2 id="hiw-validation">{text(copy.validation)}</h2>
        <p>{text(copy.validationIntro)}</p>
        <ul className="hiw-metrics">{copy.metrics.map(metric => <li key={metric.en}>{text(metric)}</li>)}</ul>
        <p>{text(copy.validationLimits)}</p>
        <a href={`${repo}docs/VALIDATION.md`}>{text(copy.validationLink)}</a>
      </section>
    </main>
  </div>;
}
