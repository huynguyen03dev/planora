import { defineConfig } from "vitest/config";
import path from "path";

// Shared config (resolve aliases, the server-only mock) inherited by both
// workspace projects. Project-specific test settings live in
// `vitest.workspace.ts` (node logic suite + happy-dom component suite).
export default defineConfig({
  test: {
    globals: true,
    alias: {
      "server-only": path.resolve(__dirname, "__mocks__/server-only.ts"),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
