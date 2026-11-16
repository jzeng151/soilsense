import type { Stream } from "./client";

/** Retain versioned historical Final evidence for a year; Late must remain revision-sensitive.
 * This is retention, not a promise NASA will never reprocess a Final product.
 * Existing entries acquire the policy on their next warm after expiry.
 */
export const imergTtlSeconds = (stream: Stream): number => stream === "final" ? 365 * 86400 : 3600;
