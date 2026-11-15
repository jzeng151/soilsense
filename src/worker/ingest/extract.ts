import { Parser } from "htmlparser2";

type Extraction = { text: string; method: "workers-ai-tomarkdown" | "plain-text" | "html-text" };

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

/**
 * Only line endings are normalized after extraction. Offsets refer to this returned
 * text, which the pipeline must save unchanged to R2, not to the original PDF/HTML.
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
  if (!result.text.trim()) throw new Error(`Extraction returned empty text: ${name}`);
  return result;
}
