import { defineConfig } from "vitest/config";
import path from "path";

// Shared config (aliases, server-only mock) inherited by both workspace
// projects; project-specific settings live in `vitest.workspace.ts`.
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
