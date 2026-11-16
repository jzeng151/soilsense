import { connect } from "cloudflare:sockets";
import { Buffer } from "node:buffer";
import { HTTPParser } from "http-parser-js";
import ipaddr from "ipaddr.js";

/** Direct HTTPS GET pinned to the validated public IP, with the original hostname
 * authenticated by TLS. fetch(hostname) and Workers node:https re-resolve DNS; never
 * fall back to those after a pinned connection failure (DNS rebinding).
 */
export async function pinnedHttps(url: URL, address: string, signal: AbortSignal, maxBytes: number): Promise<Response> {
  signal.throwIfAborted();
  if (!ipaddr.isValid(address) || ipaddr.process(address).range() !== "unicast") throw new Error("Non-public research connection address");
  const plain = connect({ hostname: address, port: 443 }, { secureTransport: "starttls", allowHalfOpen: false });
  void plain.closed.catch(() => {});
  let socket: ReturnType<typeof plain.startTls>;
  try { socket = plain.startTls({ expectedServerHostname: url.hostname }); }
  catch (error) { void plain.close().catch(() => {}); throw error; }
  void socket.closed.catch(() => {});
  let abort!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new Error("Document HTTPS deadline exceeded"));
    signal.addEventListener("abort", abort, { once: true });
  });
  const read = async () => {
    const parser = new HTTPParser(HTTPParser.RESPONSE);
    parser.maxHeaderSize = 32 * 1024;
    let complete = false, size = 0, wireSize = 0, status = 0;
    const headers = new Headers();
    const parts: Uint8Array[] = [];
    parser[HTTPParser.kOnHeadersComplete] = (info) => {
      if (info.statusCode < 200 || info.upgrade) throw new Error("Unsupported research HTTP response");
      status = info.statusCode;
      for (let i = 0; i < info.headers.length; i += 2) headers.append(info.headers[i]!, info.headers[i + 1]!);
      if (status >= 300) return 1; // Redirect/error bodies are never consumed.
      const encoding = headers.get("content-encoding");
      if (encoding && encoding.toLowerCase() !== "identity") throw new Error("Research server ignored identity encoding");
      if (Number(headers.get("content-length")) > maxBytes) throw new DocumentTooLarge();
    };
    parser[HTTPParser.kOnBody] = (chunk, offset, length) => {
      size += length;
      if (size > maxBytes) throw new DocumentTooLarge();
      parts.push(Uint8Array.from(chunk.subarray(offset, offset + length)));
    };
    parser[HTTPParser.kOnMessageComplete] = () => { complete = true; };
    const writer = socket.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(`GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.hostname}\r\nAccept: application/pdf,text/html;q=0.9\r\nAccept-Encoding: identity\r\nUser-Agent: SoilSense-Research-Intake/1.0\r\nConnection: close\r\n\r\n`));
    } finally { writer.releaseLock(); }
    const reader = socket.readable.getReader();
    try {
      while (!complete) {
        const part = await reader.read();
        if (part.done) {
          const error = parser.finish();
          if (error) throw error;
          if (!complete) throw new Error("Truncated research HTTP response");
          break;
        }
        wireSize += part.value.byteLength;
        if (wireSize > maxBytes + 1024 * 1024) throw new DocumentTooLarge();
        const result = parser.execute(Buffer.from(part.value));
        if (result instanceof Error) throw result;
      }
    } finally { reader.releaseLock(); }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { body.set(part, offset); offset += part.length; }
    headers.delete("transfer-encoding"); // Parser decoded HTTP chunk framing already.
    return new Response(size ? body : null, { status, headers });
  };
  try { return await Promise.race([read(), aborted]); }
  finally {
    signal.removeEventListener("abort", abort);
    // Cleanup must not hang intake; closure also interrupts pending reads/writes.
    void socket.close().catch(() => {});
  }
}
export class DocumentTooLarge extends Error {
  constructor() { super("Document exceeds 10 MiB"); }
}
