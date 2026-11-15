import { useI18n } from "../i18n";
import { useId } from "react";
import { glossaryEntries, GLOSSARY_VERSION, glossaryEntry } from "../../../src/shared/glossary";
import "./glossary.css";

export function Definition({ term }: { term: string }) {
  const { t: tx, language } = useI18n();
  const id = useId();
  const entry = glossaryEntry(term, language);
  return <span className="term-definition">
    <button type="button" popoverTarget={id} title={tx("Define {term}", { term: entry.technical })}>{entry.plain} <span aria-hidden="true">ⓘ</span></button>
    <span id={id} popover="auto" className="term-popover" role="note" aria-label={entry.technical}>
      <strong>{entry.plain}</strong><span className="term-technical">{entry.technical}</span>
      <span>{entry.definition}</span><span>{entry.limit}</span>
      <a href={entry.source.url} target="_blank" rel="noreferrer">{tx("Source:")}{" "}{entry.source.title}{" "}{tx("(opens a new tab)")}</a>
      <button type="button" popoverTarget={id} popoverTargetAction="hide">{tx("Close definition")}</button>
    </span>
  </span>;
}

export function Glossary() {
  const { t: tx, language } = useI18n();
  return <details className="glossary">
    <summary>{tx("Plain-language glossary — what the terms mean")}</summary>
    <p>{tx("Definitions explain terms, not which data products are available for your field. Scientific descriptions are paraphrased from linked sources; model-specific definitions describe SoilSense assumptions.")}</p>
    <dl>{glossaryEntries(language).map((entry) => <div key={entry.id} id={`glossary-${entry.id}`}>
      <dt>{entry.plain} <small>({entry.technical})</small></dt>
      <dd><p>{entry.definition}</p><p>{entry.limit}</p><a href={entry.source.url} target="_blank" rel="noreferrer">{entry.source.title}{" "}{tx("(opens a new tab)")}</a></dd>
    </div>)}</dl>
    <small>{tx("Shared vocabulary version:")}{" "}{GLOSSARY_VERSION}</small>
  </details>;
}
