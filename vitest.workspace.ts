import { defineWorkspace } from "vitest/config";

// Two projects keep environments from mixing. `node` runs the existing logic +
// Server Action + store suites (unchanged). `components` runs React Testing
// Library specs (`*.test.tsx`) on happy-dom — only those files pay the
// DOM-environment cost. Both inherit the shared aliases from vitest.config.ts.
// `vitest run` (npm test) runs both.
export default defineWorkspace([
  {
    extends: "./vitest.config.ts",
    test: {
      name: "node",
      environment: "node",
      include: ["lib/**/*.test.ts", "tests/**/*.test.ts"],
      exclude: ["node_modules", ".next", "app/generated"],
    },
  },
  {
    extends: "./vitest.config.ts",
    test: {
      name: "components",
      environment: "happy-dom",
      include: ["components/**/*.test.tsx", "app/**/*.test.tsx"],
      exclude: ["node_modules", ".next", "app/generated"],
      setupFiles: ["./vitest.setup.ts"],
    },
  },
]);
