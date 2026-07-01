import { describe, expect, it } from "vitest";

import { csvCell } from "./csv";

describe("csvCell", () => {
  it("passes through plain text unescaped", () => {
    expect(csvCell("hello")).toBe("hello");
  });

  it("quote-wraps a cell containing a comma", () => {
    expect(csvCell("a, b")).toBe('"a, b"');
  });

  it("quote-wraps and doubles embedded quotes", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("returns an empty string for null", () => {
    expect(csvCell(null)).toBe("");
  });

  it.each(["=cmd()", "+1+1", "-1+1", "@SUM(1,1)", "\tsneaky"])(
    "prefixes a leading formula char on a string cell: %s",
    (value) => {
      // Some of these also contain a comma, so the guarded result may be
      // additionally quote-wrapped — assert the prefix survived, not that
      // it's the very first character of the final cell.
      expect(csvCell(value)).toContain(`'${value}`);
    },
  );

  it("does not guard a negative number passed as a number", () => {
    expect(csvCell(-50)).toBe("-50");
  });

  it("does not guard a positive number", () => {
    expect(csvCell(50)).toBe("50");
  });

  it("does not guard booleans", () => {
    expect(csvCell(true)).toBe("true");
    expect(csvCell(false)).toBe("false");
  });

  it("guards a string that merely looks like a negative number", () => {
    expect(csvCell("-50")).toBe("'-50");
  });
});
