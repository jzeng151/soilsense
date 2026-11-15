import { useId } from "react";
import { GLOSSARY, GLOSSARY_VERSION, glossaryEntry } from "../../../src/shared/glossary";
import "./glossary.css";

export function Definition({ term }: { term: string }) {
  const id = useId();
  const entry = glossaryEntry(term);
  return <span className="term-definition">
    <button type="button" popoverTarget={id} title={`Define ${entry.technical}`}>{entry.plain} <span aria-hidden="true">ⓘ</span></button>
    <span id={id} popover="auto" className="term-popover" role="note" aria-label={entry.technical}>
      <strong>{entry.plain}</strong><span className="term-technical">{entry.technical}</span>
      <span>{entry.definition}</span><span>{entry.limit}</span>
      <a href={entry.source.url} target="_blank" rel="noreferrer">Source: {entry.source.title} (opens a new tab)</a>
      <button type="button" popoverTarget={id} popoverTargetAction="hide">Close definition</button>
    </span>
  </span>;
}

export function Glossary() {
  return <details className="glossary">
    <summary>Plain-language glossary — what the terms mean</summary>
    <p>Definitions explain terms, not which data products are available for your field. Scientific descriptions are paraphrased from linked sources; model-specific definitions describe SoilSense assumptions.</p>
    <dl>{GLOSSARY.map((entry) => <div key={entry.id} id={`glossary-${entry.id}`}>
      <dt>{entry.plain} <small>({entry.technical})</small></dt>
      <dd><p>{entry.definition}</p><p>{entry.limit}</p><a href={entry.source.url} target="_blank" rel="noreferrer">{entry.source.title} (opens a new tab)</a></dd>
    </div>)}</dl>
    <small>Shared vocabulary version: {GLOSSARY_VERSION}</small>
  </details>;
}
