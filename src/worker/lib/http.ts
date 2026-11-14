// fetch with timeout and limited retries for flaky public data services.

export class UpstreamError extends Error {
  constructor(
    public readonly service: string,
    message: string,
    public readonly status?: number,
  ) {
    super(`${service}: ${message}`);
    this.name = "UpstreamError";
  }
}

export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  service: string;
}

export async function fetchWithRetry(url: string, opts: FetchOptions): Promise<Response> {
  const { timeoutMs = 15000, retries = 1, service, ...init } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: ctrl.signal,
        headers: { "User-Agent": "SoilSense/1.0 (NASA Space Apps 2026)", Accept: "application/json, text/plain, */*", ...(init.headers ?? {}) },
      });
      clearTimeout(timer);
      if (res.status >= 500 && attempt < retries) {
        lastErr = new UpstreamError(service, `HTTP ${res.status}`, res.status);
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new UpstreamError(service, `HTTP ${res.status}`, res.status);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err instanceof UpstreamError && err.status && err.status < 500) throw err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  if (lastErr instanceof UpstreamError) throw lastErr;
  throw new UpstreamError(service, lastErr instanceof Error ? lastErr.message : "request failed");
}

export async function fetchJson<T>(url: string, opts: FetchOptions): Promise<T> {
  const res = await fetchWithRetry(url, opts);
  try {
    return (await res.json()) as T;
  } catch {
    throw new UpstreamError(opts.service, "invalid JSON response");
  }
}
