// Cloudflare-only transport. Tests mock this public network boundary explicitly.
export function connect(): never { throw new Error("Cloudflare TCP socket must be mocked in unit tests"); }
