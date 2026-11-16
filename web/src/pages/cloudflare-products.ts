// Vite embeds only this public, checked-in configuration (never .dev.vars).
import configText from "../../../wrangler.jsonc?raw";
import { howItWorksProducts } from "../i18n";

// This file uses JSON plus whole-line comments; JSON.parse fails closed if its format changes.
const config = JSON.parse(configText.replace(/^\s*\/\/.*$/gm, "")) as Record<string, unknown>;
const names: Record<keyof typeof howItWorksProducts, string> = {
  main: "Workers", assets: "Static assets", d1_databases: "D1", r2_buckets: "R2 + event notifications",
  queues: "Queues", workflows: "Workflows", durable_objects: "Durable Objects / Agents SDK",
  triggers: "Cron Triggers", ai: "Workers AI", vectorize: "Vectorize", gateway: "AI Gateway", ratelimits: "Rate Limiting",
};
function bindingNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(bindingNames);
  if (!value || typeof value !== "object") return [];
  const fields = value as Record<string, unknown>;
  if (typeof fields.binding === "string") return [fields.binding];
  // Durable Object namespaces and rate limiters use name instead of binding.
  if (typeof fields.name === "string") return [fields.name];
  return Object.values(fields).flatMap(bindingNames);
}
export const cloudflareProducts = (Object.keys(names) as (keyof typeof names)[])
  // Gateway is a call option attached to AI, not a binding of its own.
  .filter(key => Boolean(config[key === "gateway" ? "ai" : key]))
  .map(key => ({ key, name: names[key], bindings: bindingNames(config[key]), description: howItWorksProducts[key] }));
