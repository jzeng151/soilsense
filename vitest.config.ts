import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // "cloudflare:workers" only exists in the Workers runtime; tests use a small stub.
    // The Agents SDK imports other Workers-only modules, so tests use a stub for it too.
    alias: {
      "cloudflare:sockets": fileURLToPath(new URL("./test/stubs/cloudflare-sockets.ts", import.meta.url)),
      "cloudflare:workers": fileURLToPath(new URL("./test/stubs/cloudflare-workers.ts", import.meta.url)),
      agents: fileURLToPath(new URL("./test/stubs/agents.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts", "web/src/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./test/setup-i18n.ts"],
    testTimeout: 20000,
  },
});
