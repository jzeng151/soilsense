/** Model/source parts may contain local record links or malformed URLs. */
export function sourceLink(raw: string, origin: string): { href: string; label: string } | null {
  try {
    if (!/^https?:\/\//i.test(raw) && !/^\/(?!\/)/.test(raw) && !raw.startsWith("#")) return null;
    const url = new URL(raw, origin);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return { href: url.href, label: url.hostname.replace(/^www\./, "") };
  } catch { return null; }
}
