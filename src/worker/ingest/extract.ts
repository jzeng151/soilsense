import { Parser } from "htmlparser2";
import { marked, type Token, type MarkedToken } from "marked";

type Extraction = {
  text: string;
  method: "workers-ai-tomarkdown" | "workers-ai-tomarkdown+plain" | "plain-text" | "html-text";
  plainTextConversion?: { format: "markdown-to-plain-v1"; inputChars: number; outputChars: number };
  /** UTF-16 characters removed after LF normalization, before offsets are assigned. */
  converterPreamble?: { removed: boolean; chars: number };
};

/** Recognize only the observed PDF converter wrapper, never arbitrary document headings.
 * Cloudflare documents metadata inclusion, not a stable Markdown serialization. Fail
 * closed if the filename, PDF metadata marker or following section boundary differs.
 */
function removeConverterPreamble(text: string, name: string): { text: string; chars: number } {
  const title = `# ${name}\n`;
  if (!text.startsWith(title)) return { text, chars: 0 };
  const afterTitle = text.slice(title.length);
  const metadata = /^\n*## Metadata[ \t]*\n/.exec(afterTitle);
  if (!metadata) {
    // A converter filename heading without metadata; preserve all following bytes.
    return { text: afterTitle, chars: title.length };
  }
  const start = title.length + metadata[0].length;
  const next = /^## (?!Metadata[ \t]*(?:\n|$))\S[^\n]*(?:\n|$)/gm;
  next.lastIndex = start;
  const boundary = next.exec(text);
  if (!boundary || !/\bPDFFormatVersion\b/.test(text.slice(start, boundary.index))) return { text, chars: 0 };
  return { text: text.slice(boundary.index), chars: boundary.index };
}

const BLOCKS = new Set(["address", "article", "aside", "blockquote", "div", "dl", "dt", "dd", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "table", "tr", "ul"]);

function htmlText(html: string): string {
  let text = "";
  let hidden = 0;
  const parser = new Parser({
    onopentag(name) {
      if (name === "script" || name === "style") hidden++;
      if (hidden) return;
      if (BLOCKS.has(name)) text += "\n\n";
      else if (name === "br") text += "\n";
      else if (name === "td" || name === "th") text += "\t";
    },
    ontext(value) { if (!hidden) text += value; },
    onclosetag(name) {
      if (name === "script" || name === "style") { hidden = Math.max(0, hidden - 1); return; }
      if (!hidden && BLOCKS.has(name)) text += "\n\n";
    },
  }, { decodeEntities: true });
  parser.end(html);
  return text;
}

/** Preserve block/paragraph boundaries consumed by the Markdown lexer. */
function trailingNewlines(text: string, raw: string): string {
  return text.replace(/\n+$/, "") + (raw.match(/\n+$/)?.[0] ?? "");
}

/** Tokenize rather than regex-stripping: nested emphasis, escaped punctuation, code,
 * reference links and table cells must keep their words. Never render HTML in the UI.
 * Only called on converter Markdown, not user-uploaded plain text/Markdown.
 */
function plainTokens(tokens: Token[]): string {
  // No Marked extensions are installed, so lexer output contains only built-in tokens.
  return (tokens as MarkedToken[]).map((token): string => {
    switch (token.type) {
      case "space": return token.raw;
      case "heading":
      case "paragraph":
      case "blockquote": return trailingNewlines(plainTokens(token.tokens), token.raw);
      case "list": return trailingNewlines(token.items.map((item) => plainTokens(item.tokens).replace(/\n+$/, "")).join(token.loose ? "\n\n" : "\n"), token.raw);
      case "list_item": return plainTokens(token.tokens);
      case "table": return trailingNewlines([token.header, ...token.rows].map((row) => row.map((cell) => plainTokens(cell.tokens)).join(" · ")).join("\n"), token.raw);
      case "strong":
      case "em":
      case "del":
      case "link":
      case "image": return plainTokens(token.tokens);
      case "codespan": return token.text;
      case "code": return trailingNewlines(token.text, token.raw);
      case "br": return "\n";
      case "hr":
      case "def": return token.raw.match(/\n+$/)?.[0] ?? "";
      case "checkbox": return "";
      case "html": return htmlText(token.text);
      case "text": return token.tokens ? trailingNewlines(plainTokens(token.tokens), token.raw) : token.text;
      case "escape": return token.text;
    }
  }).join("");
}

/**
 * Line endings are normalized; PDF converter preambles are removed conservatively,
 * then Markdown formatting is converted to plain text without correcting words.
 * Offsets refer to this returned text, saved unchanged to R2, not the PDF/HTML.
 */
export async function extractText(ai: Ai | undefined, bytes: ArrayBuffer, name: string, contentType?: string): Promise<Extraction> {
  const extension = name.toLowerCase().match(/\.[^.\/]+$/)?.[0];
  const mime = contentType?.split(";")[0]?.trim().toLowerCase();
  let result: Extraction;
  if (extension === ".pdf" || (!extension && mime === "application/pdf")) {
    if (!ai) throw new Error("PDF extraction requires a Workers AI binding (toMarkdown)");
    const [converted] = await ai.toMarkdown([{ name, blob: new Blob([bytes], { type: "application/pdf" }) }]);
    if (!converted) throw new Error(`PDF extraction returned no result: ${name}`);
    if (converted.format === "error") throw new Error(`PDF extraction failed for ${name}: ${converted.error}`);
    if (typeof converted.data !== "string") throw new Error(`PDF extraction returned no text: ${name}`);
    result = { text: converted.data, method: "workers-ai-tomarkdown" };
  } else if (extension === ".html" || extension === ".htm" || (!extension && mime === "text/html")) {
    result = { text: htmlText(new TextDecoder().decode(bytes)), method: "html-text" };
  } else if (extension === ".txt" || extension === ".md" || (!extension && (mime === "text/plain" || mime === "text/markdown"))) {
    result = { text: new TextDecoder("utf-8", { ignoreBOM: true, fatal: false }).decode(bytes), method: "plain-text" };
  } else {
    throw new Error(`Unsupported document type: ${name}`);
  }
  result.text = result.text.replace(/\r\n?/g, "\n");
  if (result.method === "workers-ai-tomarkdown") {
    const cleaned = removeConverterPreamble(result.text, name);
    result.text = plainTokens(marked.lexer(cleaned.text, { gfm: true }));
    result.method = "workers-ai-tomarkdown+plain";
    result.converterPreamble = { removed: cleaned.chars > 0, chars: cleaned.chars };
    result.plainTextConversion = { format: "markdown-to-plain-v1", inputChars: cleaned.text.length, outputChars: result.text.length };
  }
  if (!result.text.trim()) throw new Error(`Extraction returned empty text: ${name}`);
  return result;
}
