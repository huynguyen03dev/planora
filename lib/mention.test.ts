import { describe, expect, it } from "vitest";
import { parseMentions, mentionMatchesName, extractMentionQuery } from "./mention";

describe("parseMentions", () => {
  it("extracts @mentions from content", () => {
    expect(parseMentions("@alice hello @bob")).toEqual(["alice", "bob"]);
  });

  it("deduplicates identical mentions", () => {
    expect(parseMentions("@Alice @ALICE")).toEqual(["alice"]);
  });

  it("returns empty array when no mentions exist", () => {
    expect(parseMentions("no mentions")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseMentions("")).toEqual([]);
  });

  it("extracts single token without matching logic", () => {
    expect(parseMentions("@jo")).toEqual(["jo"]);
  });

  it("handles mixed content with mentions at start, middle, and end", () => {
    expect(parseMentions("@john check @jane and @bob")).toEqual(["john", "jane", "bob"]);
  });

  it("lowercases all extracted mentions", () => {
    expect(parseMentions("@John @JANE")).toEqual(["john", "jane"]);
  });
});

describe("mentionMatchesName", () => {
  it("matches exact word", () => {
    expect(mentionMatchesName("john", "John Doe")).toBe(true);
  });

  it("matches prefix of a word", () => {
    expect(mentionMatchesName("jo", "John Doe")).toBe(true);
  });

  it("does NOT match non-prefix substring across word boundary", () => {
    // "project" does not appear as a word starting with "project" in "John Doe"
    expect(mentionMatchesName("project", "John Doe")).toBe(false);
  });

  it("matches a word that is not the first", () => {
    expect(mentionMatchesName("doe", "John Doe")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(mentionMatchesName("JOHN", "john doe")).toBe(true);
    expect(mentionMatchesName("john", "JOHN DOE")).toBe(true);
  });

  it("returns false for empty mention", () => {
    expect(mentionMatchesName("", "John Doe")).toBe(false);
  });

  it("returns false for empty name", () => {
    expect(mentionMatchesName("john", "")).toBe(false);
  });

  it("matches single-word names", () => {
    expect(mentionMatchesName("alice", "Alice")).toBe(true);
    expect(mentionMatchesName("ali", "Alice")).toBe(true);
    expect(mentionMatchesName("bob", "Alice")).toBe(false);
  });

  it("does NOT match letters in the middle of a word", () => {
    // "oh" is in the middle of "John", not a prefix
    expect(mentionMatchesName("oh", "John Doe")).toBe(false);
  });

  it("matches concatenated mention against multi-word name", () => {
    expect(mentionMatchesName("testuser", "Test User")).toBe(true);
  });

  it("matches concatenated mention prefix against multi-word name", () => {
    expect(mentionMatchesName("testu", "Test User")).toBe(true);
  });

  it("does NOT match wrong concatenated mention", () => {
    expect(mentionMatchesName("bobuser", "Test User")).toBe(false);
  });
});

describe("extractMentionQuery", () => {
  it("returns query and startIndex when cursor is right after @word", () => {
    const result = extractMentionQuery("hello @jo", 10);
    expect(result).toEqual({ query: "jo", startIndex: 6 });
  });

  it("returns query with empty string when only @ is typed", () => {
    const result = extractMentionQuery("hello @", 7);
    expect(result).toEqual({ query: "", startIndex: 6 });
  });

  it("returns null when no @ before cursor", () => {
    const result = extractMentionQuery("hello world", 11);
    expect(result).toBeNull();
  });

  it("returns null when @ is not part of mention (space before @)", () => {
    // space before @ means it's a standalone @, but extractMentionQuery
    // walks back to check. Let's test @ at position 0:
    const result = extractMentionQuery("@hello world", 6);
    expect(result).toEqual({ query: "hello", startIndex: 0 });
  });

  it("stops at space before cursor", () => {
    // If cursor is after "@jo " (with space after jo), there's no mention
    const result = extractMentionQuery("@jo hello", 4);
    // cursor is at position 4, text[3] is " "
    expect(result).toBeNull();
  });

  it("handles cursor in middle of a word", () => {
    const result = extractMentionQuery("@john", 4);
    expect(result).toEqual({ query: "joh", startIndex: 0 });
  });

  it("handles cursor at start of text", () => {
    const result = extractMentionQuery("", 0);
    expect(result).toBeNull();
  });

  it("stops at newline before cursor", () => {
    const result = extractMentionQuery("line1\n@jo", 10);
    expect(result).toEqual({ query: "jo", startIndex: 6 });
  });

  it("handles multiple @ in the same line", () => {
    const result = extractMentionQuery("@alice @bob", 12);
    expect(result).toEqual({ query: "bob", startIndex: 7 });
  });

  it("handles special characters in mention query", () => {
    const result = extractMentionQuery("@john.doe", 9);
    expect(result).toEqual({ query: "john.doe", startIndex: 0 });
  });
});
