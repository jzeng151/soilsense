// Test-only stand-in for the "agents" package (Cloudflare Agents SDK), which imports Workers-only
// modules ("cloudflare:*") that Node can't load. Production code uses the real SDK.
import { DurableObject } from "./cloudflare-workers";

export class Agent<Env = unknown> extends DurableObject<Env> {
  sql<T = Record<string, unknown>>(_strings: TemplateStringsArray, ..._values: unknown[]): T[] {
    throw new Error("Agent.sql is not available in tests; use SqlRunStore with a test SQL tag instead.");
  }
  async schedule(_when: number | Date | string, _callback: string, _payload?: unknown): Promise<{ id: string }> {
    throw new Error("Agent.schedule is not available in tests.");
  }
}

/** Same contract as the SDK: a stub for the named instance of the namespace. */
export async function getAgentByName(ns: DurableObjectNamespace, name: string): Promise<unknown> {
  return ns.get(ns.idFromName(name));
}
