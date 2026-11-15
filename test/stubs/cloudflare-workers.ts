// Test-only stand-in for the "cloudflare:workers" module, which exists only inside the Workers runtime.
// Lets Vitest (Node) import the Worker entry, which exports Durable Object classes.
export class DurableObject<Env = unknown> {
  constructor(
    public ctx: unknown,
    public env: Env,
  ) {}
}
