import type { FieldResearchNote } from "../../../src/shared/fieldResearch";

const STATUS: Record<FieldResearchNote["status"], string> = {
  live: "Retrieved research", saved: "Saved research", empty: "No matching research",
  unavailable: "Research unavailable", skipped: "Research skipped",
};

/** Only verbatim corpus passages and fixed labels: no generated agronomic advice. */
export function ResearchNote({ note }: { note?: FieldResearchNote }) {
  if (!note) return null; // Historical runs created before research notes remain readable.
  return (
    <section aria-label="Cited research note" style={{ minWidth: 0, overflowWrap: "anywhere", marginBlock: "1rem" }}>
      <h5 style={{ marginBlock: "0.5rem" }}>Research note · {STATUS[note.status]}</h5>
      <p>{note.template}</p>
      {note.passages.length === 0 ? (
        <p>No matching research is available for this run. {note.reason}</p>
      ) : note.passages.slice(0, 2).map((p) => (
        <figure key={p.chunkId} style={{ margin: "0.75rem 0" }}>
          <blockquote cite={p.sourceUrl} style={{ whiteSpace: "pre-line", margin: "0.5rem 0", paddingLeft: "0.75rem", borderLeft: "2px solid currentColor" }}>{p.text}</blockquote>
          <figcaption>
            <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">{p.sourceTitle}</a> ({p.year})
            <p><strong>Applicability:</strong> {p.applicability}</p>
            <small>{p.attribution} · {p.license}{p.score !== undefined && <> · Retrieval score: {p.score.toFixed(3)}</>}</small>
          </figcaption>
        </figure>
      ))}
      <p className="fw-meta">
        Crop tags: {note.tags.join(", ").replaceAll("_", " ") || "none"}{note.cropSource && <> ({note.cropSource})</>}
        {note.retrievedAt && <> · Retrieved {note.retrievedAt}</>}
        {" "}· Corpus {note.corpusVersion}
      </p>
    </section>
  );
}
