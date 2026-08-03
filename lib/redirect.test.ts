import { describe, expect, it } from "vitest";

import { DEFAULT_INTERNAL_PATH, safeInternalPath } from "./redirect";

describe("safeInternalPath", () => {
  it("returns the path when it is an internal absolute path", () => {
    expect(safeInternalPath("/boards")).toBe("/boards");
    expect(safeInternalPath("/boards/abc?x=1")).toBe("/boards/abc?x=1");
    expect(safeInternalPath("/")).toBe("/");
  });

  it("rejects protocol-relative URLs that would redirect off-site", () => {
    expect(safeInternalPath("//evil.com")).toBe(DEFAULT_INTERNAL_PATH);
    expect(safeInternalPath("//evil.com/path")).toBe(DEFAULT_INTERNAL_PATH);
  });

  it("rejects absolute external URLs and other schemes", () => {
    expect(safeInternalPath("https://evil.com")).toBe(DEFAULT_INTERNAL_PATH);
    expect(safeInternalPath("http://evil.com")).toBe(DEFAULT_INTERNAL_PATH);
    expect(safeInternalPath("javascript:alert(1)")).toBe(DEFAULT_INTERNAL_PATH);
    expect(safeInternalPath("data:text/html,<x>")).toBe(DEFAULT_INTERNAL_PATH);
  });

  it("rejects relative paths and empty input", () => {
    expect(safeInternalPath("boards")).toBe(DEFAULT_INTERNAL_PATH);
    expect(safeInternalPath("")).toBe(DEFAULT_INTERNAL_PATH);
  });

  it("falls back to the default for undefined input", () => {
    expect(safeInternalPath(undefined)).toBe(DEFAULT_INTERNAL_PATH);
  });
});
