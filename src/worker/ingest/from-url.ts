import puppeteer from "@cloudflare/puppeteer";
import ipaddr from "ipaddr.js";
import { parseDocument } from "htmlparser2";
import { findAll, removeElement, textContent } from "domutils";
import serialize from "dom-serializer";
import type { Env } from "../env";
import { extractText } from "./extract";
import { sha256Hex } from "./hash";
import { pinnedHttps, DocumentTooLarge } from "./url-https";

/** Reviewed policy, deliberately not a caller-supplied list. A leading *. also permits the apex. */
export const RESEARCH_HOSTS = ["*.k-state.edu", "*.ksu.edu", "newprairiepress.org", "ksu.janeway.systems", "extension.*.edu", "*.usda.gov", "*.nasa.gov"] as const;
export const URL_MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT = 30_000;
export class UrlIntakeError extends Error {
  constructor(message: string, public readonly status: 400 | 413 | 422 | 502 = 400) { super(message); }
}
export function researchUrl(value: unknown): URL {
  if (typeof value !== "string" || value.length > 2000) throw new UrlIntakeError("A research URL (maximum 2000 characters) is required");
  let url: URL;
  try { url = new URL(value); } catch { throw new UrlIntakeError("Invalid research URL"); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new UrlIntakeError("Only HTTPS URLs on port 443 without credentials are allowed");
  const host = url.hostname;
  // Reject IP literals (including alternative IPv4 notation normalized by URL), trailing dots and malformed labels.
  if (ipaddr.isValid(host.replace(/^\[|\]$/g, "")) || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host)) throw new UrlIntakeError("A public research hostname is required");
  const allowed = RESEARCH_HOSTS.some((pattern) => pattern.startsWith("*.")
    ? host === pattern.slice(2) || host.endsWith(pattern.slice(1))
    : pattern === "extension.*.edu" ? /^extension\.[a-z0-9-]+\.edu$/.test(host) : host === pattern);
  if (!allowed) throw new UrlIntakeError("Research host is not on the allow-list");
  url.hash = "";
  return url;
}

/** Fail closed on DNS errors and any non-public answer, including mapped IPv6. */
async function publicDns(host: string, signal: AbortSignal): Promise<string[]> {
  const addresses: string[] = [];
  for (const type of ["A", "AAAA"]) {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, { headers: { Accept: "application/dns-json" }, redirect: "manual", signal });
    if (!response.ok) throw new UrlIntakeError("Research host DNS lookup failed", 502);
    const data = await response.json() as { Status?: number; Answer?: { type: number; data: string }[] };
    if (data.Status !== 0) throw new UrlIntakeError("Research host DNS lookup failed", 502);
    for (const answer of data.Answer ?? []) {
      if (answer.type !== 1 && answer.type !== 28) continue;
      if (!ipaddr.isValid(answer.data) || ipaddr.process(answer.data).range() !== "unicast") throw new UrlIntakeError("Research host resolves to a non-public address");
      addresses.push(answer.data);
    }
  }
  if (!addresses.length) throw new UrlIntakeError("Research host has no public address", 502);
  return addresses;
}
async function boundedBytes(response: Response): Promise<ArrayBuffer> {
  if (Number(response.headers.get("content-length")) > URL_MAX_BYTES) { await response.body?.cancel(); throw new UrlIntakeError("Document exceeds 10 MiB", 413); }
  if (!response.body) throw new UrlIntakeError("Empty document", 422);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > URL_MAX_BYTES) { await reader.cancel(); throw new UrlIntakeError("Document exceeds 10 MiB", 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  if (!size) throw new UrlIntakeError("Empty document", 422);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result.buffer;
}

/** Readability-style semantic selection, not a model: prefer article/main and omit navigation/boilerplate.
 * The plain-fetch fallback uses the exact same HTML-to-text path as uploaded HTML. */
export function articleHtml(html: string): string {
  const document = parseDocument(html);
  const boilerplate = new Set(["script", "style", "noscript", "nav", "footer", "aside", "form"]);
  for (const element of findAll((node) => boilerplate.has(node.name) || "hidden" in node.attribs || node.attribs["aria-hidden"] === "true", document.children)) removeElement(element);
  const candidates = findAll((node) => node.name === "article" || node.name === "main" || node.attribs.role === "main", document.children);
  const root = candidates.sort((a, b) => textContent(b).length - textContent(a).length)[0] ?? document;
  return serialize(root);
}

/** Render the fetched snapshot, never navigate the browser to an untrusted URL. No browser
 * network or page scripts: redirects, scripts and subresources cannot bypass the URL/DNS guard.
 * This intentionally cannot extract JS-only articles; those require an uploaded licensed copy. */
async function within<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new UrlIntakeError("Browser Rendering deadline exceeded", 502)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
async function renderedText(binding: NonNullable<Env["BROWSER"]>, html: string): Promise<string> {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  let expired = false;
  const render = async () => {
    browser = await puppeteer.launch(binding);
    if (expired) {
      void within(browser.close(), 2000).catch(() => {});
      throw new UrlIntakeError("Browser Rendering deadline exceeded", 502);
    }
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (request) => { void request.abort().catch(() => {}); });
    page.setDefaultTimeout(TIMEOUT);
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
    // String expression executes inside Chrome; Workers have no DOM types.
    return await page.evaluate(`(() => {
      document.querySelectorAll('script,style,noscript,nav,footer,aside,form,[hidden],[aria-hidden="true"]').forEach(n => n.remove());
      const candidates = [...document.querySelectorAll('article,main,[role="main"]')];
      const root = candidates.sort((a,b) => b.innerText.length - a.innerText.length)[0] || document.body;
      return (root?.innerText || '').slice(0, ${URL_MAX_BYTES + 1});
    })()`) as string;
  };
  try { return await within(render(), TIMEOUT); }
  finally {
    expired = true;
    if (browser) await within(browser.close(), 2000).catch(() => {});
  }
}
export async function documentFromUrl(env: Env, value: unknown) {
  const source = researchUrl(value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT);
  let response: Response, bytes: ArrayBuffer;
  let current = source;
  try {
    // Only same-host HTTPS redirects, revalidated each hop; never forward admin credentials.
    for (let hop = 0; ; hop++) {
      const addresses = await publicDns(current.hostname, controller.signal);
      response = await pinnedHttps(current, addresses[0]!, controller.signal, URL_MAX_BYTES);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location || hop >= 3) throw new UrlIntakeError("Too many or invalid document redirects", 502);
        let target: URL;
        try { target = researchUrl(new URL(location, current).href); } catch { throw new UrlIntakeError("Unsafe document redirect"); }
        if (target.hostname !== source.hostname) throw new UrlIntakeError("Redirects to other hosts are not allowed");
        current = target;
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new UrlIntakeError(`Research server returned HTTP ${response.status}`, 502); }
      bytes = await boundedBytes(response);
      break;
    }
  } catch (error) {
    if (error instanceof DocumentTooLarge) throw new UrlIntakeError(error.message, 413);
    throw error;
  } finally { clearTimeout(timeout); }
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  let method: "direct-pdf" | "browser-rendering" | "html-fetch-fallback";
  let extension: string;
  const signature = new TextDecoder().decode(bytes.slice(0, 5));
  if (signature === "%PDF-") { method = "direct-pdf"; extension = ".pdf"; }
  else {
    if (contentType !== "text/html" && contentType !== "application/xhtml+xml") throw new UrlIntakeError("Only PDF or HTML research documents are supported", 422);
    if (source.pathname.toLowerCase().endsWith(".pdf")) throw new UrlIntakeError("PDF URL returned HTML instead of PDF bytes", 422);
    const html = new TextDecoder().decode(bytes);
    method = env.BROWSER ? "browser-rendering" : "html-fetch-fallback";
    const text = env.BROWSER ? await renderedText(env.BROWSER, html) : (await extractText(undefined, new TextEncoder().encode(articleHtml(html)).buffer as ArrayBuffer, "article.html", "text/html")).text;
    if (!text.trim()) throw new UrlIntakeError("Page has no extractable article text; upload a copy instead", 422);
    bytes = new TextEncoder().encode(text).buffer as ArrayBuffer;
    if (bytes.byteLength > URL_MAX_BYTES) throw new UrlIntakeError("Extracted document exceeds 10 MiB", 413);
    extension = ".txt";
  }
  const slug = (source.pathname.split("/").filter(Boolean).pop() ?? source.hostname).replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "research";
  const key = `docs/url-${slug}-${(await sha256Hex(source.href)).slice(0, 16)}${extension}`;
  const retrievedAt = new Date().toISOString();
  const object = await env.DOCS!.put(key, bytes, {
    httpMetadata: { contentType: extension === ".pdf" ? "application/pdf" : "text/plain; charset=utf-8" },
    customMetadata: { sourceUrl: source.href, retrievedAt, resolvedUrl: current.href, intakeMethod: method },
  });
  return { key, eTag: object?.etag, size: bytes.byteLength, sourceUrl: source.href, retrievedAt, method, note: method === "html-fetch-fallback" ? "BROWSER is not bound: plain fetch and HTML-to-text fallback used. R2 notification starts human-reviewed ingestion asynchronously." : "R2 notification starts human-reviewed ingestion asynchronously." };
}
