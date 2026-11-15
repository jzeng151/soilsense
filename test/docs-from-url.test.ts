import { afterEach, describe, expect, it, vi } from "vitest";
import { docs } from "../src/worker/routes/docs";
import type { Env } from "../src/worker/env";

const transport = vi.hoisted(() => vi.fn());
vi.mock("../src/worker/ingest/url-https", () => ({ pinnedHttps: transport, DocumentTooLarge: class extends Error {} }));
const browser = vi.hoisted(() => ({ launch: vi.fn(), close: vi.fn(), setJavaScriptEnabled: vi.fn(), setRequestInterception: vi.fn(), on: vi.fn(), setDefaultTimeout: vi.fn(), setContent: vi.fn(), evaluate: vi.fn() }));
vi.mock("@cloudflare/puppeteer", () => ({ default: { launch: browser.launch } }));
const put = vi.fn(async (_key: string, _bytes: ArrayBuffer, _options: unknown) => ({ etag: "stored" }));
function network(document: () => Response = () => new Response("%PDF-1.7 fixture", { headers: { "content-type": "application/pdf" } }), addresses = ["129.130.1.1"]) {
  transport.mockImplementation(async () => document());
  const mock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("https://cloudflare-dns.com/")) return Response.json({ Status: 0, Answer: addresses.map((data) => ({ type: data.includes(":") ? 28 : 1, data })) });
    return document();
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}
const env = { ADMIN_TOKEN: "test-only", DOCS: { put } } as unknown as Env;
const request = (url: string, auth = true, bindings = env) => docs.request("/from-url", { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer test-only" } : {}) }, body: JSON.stringify({ url }) }, bindings);
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("document URL intake", () => {
  it("requires admin authentication before accessing the network", async () => {
    const network = vi.fn(); vi.stubGlobal("fetch", network);
    expect((await request("https://www.ksu.edu/paper.pdf", false)).status).toBe(401);
    expect(network).not.toHaveBeenCalled();
  });
  it.each(["http://www.ksu.edu/a", "https://www.ksu.edu.evil.org/a", "https://evilksu.edu/a", "https://localhost/a", "https://127.0.0.1/a", "https://2130706433/a", "https://[::1]/a", "https://user:pass@www.ksu.edu/a", "https://www.ksu.edu:8443/a", "https://extension.evil.org/a", "https://www.ksu.edu./a", "file:///etc/passwd"]) ("rejects unsafe URL %s before network access", async (url) => {
    const mock = network();
    expect((await request(url)).status).toBe(400); expect(mock).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled();
  });
  it.each(["k-state.edu", "www.ksu.edu", "newprairiepress.org", "ksu.janeway.systems", "extension.purdue.edu", "www.nrcs.usda.gov", "earthdata.nasa.gov"])("allows research host %s and saves source provenance with PDF bytes", async (host) => {
    network();
    const response = await request(`https://${host}/paper`);
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ status: "queued", method: "direct-pdf", sourceUrl: `https://${host}/paper` });
    const [key, bytes, options] = put.mock.calls[0]!;
    expect(key).toMatch(/^docs\/url-paper-[0-9a-f]{16}\.pdf$/);
    expect(new TextDecoder().decode(bytes)).toBe("%PDF-1.7 fixture");
    expect(options).toMatchObject({ customMetadata: { sourceUrl: `https://${host}/paper`, retrievedAt: expect.stringMatching(/^\d{4}-/), intakeMethod: "direct-pdf" } });
    expect(browser.launch).not.toHaveBeenCalled();
  });
  it.each(["127.0.0.1", "10.1.2.3", "172.16.1.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "2001:db8::1"])("rejects non-public DNS answer %s", async (address) => {
    const mock = network(undefined, ["129.130.1.1", address]);
    expect((await request("https://www.ksu.edu/paper")).status).toBe(400);
    expect(mock.mock.calls.every(([url]) => String(url).startsWith("https://cloudflare-dns.com/"))).toBe(true);
    expect(put).not.toHaveBeenCalled();
  });
  it("rejects cross-host redirects even to another allowed host", async () => {
    network(() => new Response(null, { status: 302, headers: { location: "https://nasa.gov/a" } }));
    expect((await request("https://www.ksu.edu/paper")).status).toBe(400); expect(put).not.toHaveBeenCalled();
  });
  it("follows only bounded same-host HTTPS redirects", async () => {
    let calls = 0;
    network(() => ++calls === 1 ? new Response(null, { status: 302, headers: { location: "/actual" } }) : new Response("%PDF-1.7"));
    expect((await request("https://www.ksu.edu/paper")).status).toBe(202);
    expect(put.mock.calls[0]![2]).toMatchObject({ customMetadata: { sourceUrl: "https://www.ksu.edu/paper", resolvedUrl: "https://www.ksu.edu/actual" } });
  });
  it("uses plain-fetch article extraction without BROWSER and reports the fallback", async () => {
    network(() => new Response("<nav>Unrelated navigation</nav><main><header><h1>Soil research</h1></header><p>Rotation &amp; water.</p><script>bad()</script></main><footer>Boilerplate</footer>", { headers: { "content-type": "text/html" } }));
    const response = await request("https://www.ksu.edu/article");
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ method: "html-fetch-fallback", note: expect.stringContaining("BROWSER is not bound") });
    const [key, bytes] = put.mock.calls[0]!;
    expect(key).toMatch(/\.txt$/); const text = new TextDecoder().decode(bytes);
    expect(text).toContain("Soil research"); expect(text).toContain("Rotation & water.");
    expect(text).not.toMatch(/navigation|bad\(\)|Boilerplate/);
  });
  it("renders a network-isolated HTML snapshot using the optional browser and closes it", async () => {
    network(() => new Response("<main>Research text</main>", { headers: { "content-type": "text/html" } }));
    browser.launch.mockResolvedValue({ newPage: async () => browser, close: browser.close });
    browser.evaluate.mockResolvedValue("Rendered article text");
    const binding = {} as NonNullable<Env["BROWSER"]>;
    const response = await request("https://www.ksu.edu/article", true, { ...env, BROWSER: binding });
    expect(response.status).toBe(202); expect(await response.json()).toMatchObject({ method: "browser-rendering" });
    expect(browser.launch).toHaveBeenCalledWith(binding);
    expect(browser.setJavaScriptEnabled).toHaveBeenCalledWith(false);
    expect(browser.setRequestInterception).toHaveBeenCalledWith(true);
    expect(browser.setContent).toHaveBeenCalledWith("<main>Research text</main>", expect.any(Object));
    expect(new TextDecoder().decode(put.mock.calls[0]![1])).toBe("Rendered article text");
    expect(browser.close).toHaveBeenCalledOnce();
  });
  it("closes browser and does not store a failed render", async () => {
    network(() => new Response("<main>Research</main>", { headers: { "content-type": "text/html" } }));
    browser.launch.mockResolvedValue({ newPage: async () => browser, close: browser.close });
    browser.evaluate.mockRejectedValueOnce(new Error("render failed"));
    expect((await request("https://www.ksu.edu/article", true, { ...env, BROWSER: {} as NonNullable<Env["BROWSER"]> })).status).toBe(502);
    expect(browser.close).toHaveBeenCalledOnce(); expect(put).not.toHaveBeenCalled();
  });
  it("bounds browser acquisition and closes a session that arrives after the deadline", async () => {
    vi.useFakeTimers();
    network(() => new Response("<main>Research</main>", { headers: { "content-type": "text/html" } }));
    let resolveLaunch!: (value: unknown) => void;
    browser.launch.mockImplementationOnce(() => new Promise((resolve) => { resolveLaunch = resolve; }));
    const pending = request("https://www.ksu.edu/article", true, { ...env, BROWSER: {} as NonNullable<Env["BROWSER"]> });
    await vi.advanceTimersByTimeAsync(30_001);
    expect((await pending).status).toBe(502); expect(put).not.toHaveBeenCalled();
    resolveLaunch({ close: browser.close });
    await vi.advanceTimersByTimeAsync(0);
    expect(browser.close).toHaveBeenCalledOnce();
  });
  it("rejects claimed and streamed oversized documents", async () => {
    network(() => new Response("%PDF-1.7", { headers: { "content-length": "10485761" } }));
    expect((await request("https://www.ksu.edu/paper")).status).toBe(413);
    network(() => new Response(new Uint8Array(10485761)));
    expect((await request("https://www.ksu.edu/paper")).status).toBe(413); expect(put).not.toHaveBeenCalled();
  });
  it("rejects a PDF URL returning HTML and unsupported content", async () => {
    network(() => new Response("<h1>Not found</h1>", { headers: { "content-type": "text/html" } }));
    expect((await request("https://www.ksu.edu/paper.pdf")).status).toBe(422);
    network(() => new Response("not a document", { headers: { "content-type": "application/json" } }));
    expect((await request("https://www.ksu.edu/paper")).status).toBe(422); expect(put).not.toHaveBeenCalled();
  });
});
