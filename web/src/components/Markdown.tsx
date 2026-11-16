// Minimal, safe markdown renderer for chat replies (no raw HTML): headings, paragraphs,
// bullet / numbered lists, tables, fenced code, inline **bold**, *italic*, `code` and links.

import type { ReactNode } from "react";
import { useI18n } from "../i18n";
import { sourceLink } from "./sourceLink";
export type MarkdownReferences = Record<string, { label: string; href?: string; detail?: string }>;


function inline(text: string, keyBase: string, references: MarkdownReferences, unavailable: (id: string) => string): ReactNode[] {
  // Only the known rotation notation, not arbitrary math or currency. Code is left verbatim.
  text = text.split(/(`[^`]*`)/g).map((part, i) => i % 2 ? part : part.replace(/\$\s*\\+rightarrow\s*\$/g, "→")).join("");
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*[^*\s][^*]*\*|\[(?:[RFG]\d+|[a-z]+(?:-[a-z0-9]+)*|[^\]\s]+\/[^\]\s]+)\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${keyBase}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k}>{inline(t.slice(2, -2), k, references, unavailable)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const mm = /^\[([^\]]+)\]\((.+)\)$/.exec(t);
      if (!mm) {
        const id = t.slice(1, -1);
        const ref = references[id];
        if (!ref && !/^(?:[RFG]\d+|(?:trend|risk|losses|agro)-[a-z0-9-]+|soil)$/.test(id)) {
          out.push(t); last = m.index + t.length; continue;
        }
        const link = ref?.href ? sourceLink(ref.href, "https://soilsense.invalid") : null;
        out.push(ref ? (link ? <a key={k} href={link.href} title={ref.detail} target="_blank" rel="noreferrer">({ref.label})</a> : <span key={k} title={ref.detail}>({ref.label})</span>) : <span key={k} className="md-unverified">{unavailable(id)}</span>);
        last = m.index + t.length;
        continue;
      }
      out.push(
        <a key={k} href={mm?.[2]} target="_blank" rel="noreferrer">
          {mm?.[1]}
        </a>,
      );
    } else out.push(<em key={k}>{inline(t.slice(1, -1), k, references, unavailable)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export function Markdown({ text, references = {} }: { text: string; references?: MarkdownReferences }) {
  const { t } = useI18n();
  const unavailable = (id: string) => t("Source unavailable ({id})", { id });
  const renderInline = (value: string, key: string) => inline(value, key, references, unavailable);
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const key = `b${k++}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) code.push(lines[i++]!);
      i++;
      blocks.push(
        <pre key={key}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push(<h4 key={key}>{renderInline(h[2]!, key)}</h4>);
      i++;
      continue;
    }
    if (line.trim().startsWith("|") && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? "")) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|")) rows.push(cells(lines[i++]!));
      blocks.push(
        <div className="md-table" key={key}>
          <table>
            <thead>
              <tr>{head.map((c, j) => <th key={j}>{renderInline(c, `${key}h${j}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>{r.map((c, j) => <td key={j}>{renderInline(c, `${key}r${ri}c${j}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i]!) && /^\s*\d+[.)]/.test(lines[i]!) === ordered) items.push(lines[i++]!.replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={key}>
          {items.map((it, j) => (
            <li key={j}>{renderInline(it, `${key}i${j}`)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,4}\s|```|\s*([-*•]|\d+[.)])\s+|\s*\|)/.test(lines[i]!)) para.push(lines[i++]!);
    if (!para.length) para.push(lines[i++]!);
    blocks.push(<p key={key}>{renderInline(para.join(" "), key)}</p>);
  }
  return <div className="md">{blocks}</div>;
}
