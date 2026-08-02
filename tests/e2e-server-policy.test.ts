import { describe, expect, it } from "vitest";

import { shouldReuseExistingE2eServer } from "@/lib/e2e-server-policy";

describe("E2E server reuse policy", () => {
  it("starts a fresh server by default for local and CI runs", () => {
    expect(shouldReuseExistingE2eServer({})).toBe(false);
    expect(shouldReuseExistingE2eServer({ CI: "true" })).toBe(false);
  });

  it("allows only an explicit local opt-in", () => {
    expect(
      shouldReuseExistingE2eServer({ PLAYWRIGHT_REUSE_EXISTING_SERVER: "1" }),
    ).toBe(true);
    expect(
      shouldReuseExistingE2eServer({ PLAYWRIGHT_REUSE_EXISTING_SERVER: "true" }),
    ).toBe(false);
    expect(
      shouldReuseExistingE2eServer({
        CI: "true",
        PLAYWRIGHT_REUSE_EXISTING_SERVER: "1",
      }),
    ).toBe(false);
  });
});
