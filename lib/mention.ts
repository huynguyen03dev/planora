/**
 * Parse @mention tokens from a string, returning unique lowercased mention
 * names. Exported for unit testing.
 */
export function parseMentions(content: string): string[] {
  const mentionRegex = /@(\w+)/g;
  const mentions = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.add(match[1].toLowerCase());
  }
  return Array.from(mentions);
}

/**
 * Check if a mention text matches a display name using word-boundary prefix
 * matching. Returns true if the name contains a word that starts with the
 * mention text (case-insensitive). Exported for unit testing.
 */
export function mentionMatchesName(mention: string, name: string): boolean {
  if (!mention) return false;
  const lowerMention = mention.toLowerCase();
  const lowerName = name.toLowerCase();
  // Word-boundary prefix match: "jo" matches "John Doe"
  const words = lowerName.split(/\s+/);
  if (words.some((word) => word.startsWith(lowerMention))) return true;
  // Concatenated match: "johndoe" matches "John Doe"
  return lowerName.replace(/\s+/g, "").startsWith(lowerMention);
}

/**
 * Walk backwards from cursorPos in text to find an '@' character that starts
 * a mention. Returns the query text (everything between '@' and cursor) and
 * the index of the '@', or null if no active mention is found.
 */
export function extractMentionQuery(
  text: string,
  cursorPos: number,
): { query: string; startIndex: number } | null {
  let i = cursorPos - 1;
  while (i >= 0 && text[i] !== " " && text[i] !== "\n") {
    if (text[i] === "@") {
      return { query: text.slice(i + 1, cursorPos), startIndex: i };
    }
    i--;
  }
  return null;
}
