// Evidence-only transport: deadline covers headers AND the bounded response body.
export async function crosscheckText(url: string, init: RequestInit = {}, timeoutMs = 30000): Promise<string> {
  const controller = new AbortController();
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal });
        if (!response.ok) throw new Error(`Evidence provider HTTP ${response.status}`);
        reader = response.body?.getReader();
        if (!reader) throw new Error("Empty evidence response");
        const chunks: Uint8Array[] = []; let length = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 1024 * 1024) throw new Error("Evidence response exceeds 1 MiB");
          chunks.push(value);
        }
        const bytes = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        return new TextDecoder().decode(bytes);
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Evidence provider deadline exceeded")), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer); controller.abort();
    // Do not await a provider stream's potentially stalled cancellation hook.
    void reader?.cancel().catch(() => {});
  }
}
export async function crosscheckJson<T>(url: string, init: RequestInit = {}, timeoutMs = 30000): Promise<T> {
  return JSON.parse(await crosscheckText(url, init, timeoutMs)) as T;
}
