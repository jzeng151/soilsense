import { afterEach, expect, it, vi } from "vitest";
import { pinnedHttps, DocumentTooLarge } from "../src/worker/ingest/url-https";
const connect = vi.hoisted(() => vi.fn());
vi.mock("cloudflare:sockets", () => ({ connect }));
afterEach(() => vi.clearAllMocks());
const url = new URL("https://www.ksu.edu/paper?version=1");
function socket(parts: string[], hang = false) {
  const write = vi.fn();
  const close = vi.fn(async () => {});
  const tls = {
    closed: Promise.resolve(), close,
    writable: new WritableStream({ write }),
    readable: new ReadableStream<Uint8Array>({ start(controller) {
      for (const part of parts) controller.enqueue(new TextEncoder().encode(part));
      if (!hang) controller.close();
    } }),
  };
  const startTls = vi.fn(() => tls);
  connect.mockReturnValue({ closed: Promise.resolve(), startTls, close });
  return { startTls, write, close };
}
it("pins the connection to the validated IP and verifies TLS against the original hostname, with no second DNS lookup", async () => {
  const s = socket(["HTTP/1.1 200 OK\r\nContent-Length: 8\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7"]);
  const response = await pinnedHttps(url, "129.130.1.1", new AbortController().signal, 1024);
  expect(connect).toHaveBeenCalledExactlyOnceWith({ hostname: "129.130.1.1", port: 443 }, { secureTransport: "starttls", allowHalfOpen: false });
  expect(s.startTls).toHaveBeenCalledExactlyOnceWith({ expectedServerHostname: "www.ksu.edu" });
  const request = new TextDecoder().decode(s.write.mock.calls[0]![0]);
  expect(request).toContain("GET /paper?version=1 HTTP/1.1\r\nHost: www.ksu.edu\r\n");
  expect(request).not.toContain("Authorization");
  expect(await response.text()).toBe("%PDF-1.7"); expect(s.close).toHaveBeenCalledOnce();
});
it("decodes fragmented chunked HTTP without confusing chunk framing with document bytes", async () => {
  socket(["HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n4\r", "\nSoil\r\n5\r\n text\r\n0\r\n\r\n"]);
  const response = await pinnedHttps(url, "129.130.1.1", new AbortController().signal, 9);
  expect(await response.text()).toBe("Soil text"); expect(response.headers.has("transfer-encoding")).toBe(false);
});
it("stops at redirect headers rather than following or reading an unbounded body", async () => {
  const s = socket(["HTTP/1.1 302 Found\r\nLocation: https://127.0.0.1/\r\nContent-Length: 9999999\r\n\r\n"], true);
  const response = await pinnedHttps(url, "129.130.1.1", new AbortController().signal, 10);
  expect(response.status).toBe(302); expect(response.headers.get("location")).toBe("https://127.0.0.1/"); expect(s.close).toHaveBeenCalledOnce();
});
it.each(["HTTP/1.1 200 OK\r\nContent-Length: 20\r\n\r\n", "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nB\r\n12345678901\r\n0\r\n\r\n"])("enforces declared and streamed body limits", async (response) => {
  const s = socket([response]);
  await expect(pinnedHttps(url, "129.130.1.1", new AbortController().signal, 10)).rejects.toBeInstanceOf(DocumentTooLarge);
  expect(s.close).toHaveBeenCalledOnce();
});
it.each(["127.0.0.1", "169.254.169.254", "::ffff:10.0.0.1", "fd00::1"])("rejects a non-public connection address %s before opening a socket", async (address) => {
  await expect(pinnedHttps(url, address, new AbortController().signal, 10)).rejects.toThrow("Non-public"); expect(connect).not.toHaveBeenCalled();
});
it("fails closed on TLS certificate errors without retrying an unpinned hostname", async () => {
  const s = socket([]);
  s.startTls.mockImplementation(() => { throw new Error("TLS certificate hostname mismatch"); });
  await expect(pinnedHttps(url, "129.130.1.1", new AbortController().signal, 1024)).rejects.toThrow("hostname mismatch");
  expect(connect).toHaveBeenCalledOnce();
});
it("aborts stalled reads and closes the socket", async () => {
  const s = socket([], true); const controller = new AbortController();
  const result = pinnedHttps(url, "129.130.1.1", controller.signal, 10);
  controller.abort();
  await expect(result).rejects.toThrow("deadline"); expect(s.close).toHaveBeenCalledOnce();
});
it("rejects truncated or compressed responses instead of storing corrupt source text", async () => {
  socket(["HTTP/1.1 200 OK\r\nContent-Length: 20\r\n\r\nshort"]);
  await expect(pinnedHttps(url, "129.130.1.1", new AbortController().signal, 1024)).rejects.toThrow();
  socket(["HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\n\r\n"]);
  await expect(pinnedHttps(url, "129.130.1.1", new AbortController().signal, 1024)).rejects.toThrow("identity encoding");
});
