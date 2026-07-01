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

export type MentionMatch<M> = {
  /** The matched member. */
  member: M;
  /** Index of the '@' that starts the mention. */
  start: number;
  /** Index just past the matched name (exclusive) — the highlight boundary. */
  end: number;
};

/**
 * Resolve @mentions in `content` against `members`, matching each '@' to the
 * longest member DISPLAY NAME that follows it and is not run into another
 * letter. Returns matches in document order with their boundaries, so both the
 * notify path (`lib/notification.ts`) and the comment highlighter
 * (`card-detail-sheet.tsx`) can share one implementation.
 *
 * Full-name matching is intentional and preserves the prior inline scanners'
 * behavior (US-057, "unify + test, no behavior change"). It is NOT the
 * word-boundary *prefix* rule of `mentionMatchesName` — that rule powers only
 * the autocomplete suggestion list, where picking a suggestion inserts the full
 * name. Partial / ambiguous-prefix resolution was deliberately not adopted.
 */
export function resolveMentions<M extends { name: string }>(
  content: string,
  members: readonly M[],
): MentionMatch<M>[] {
  const named = members.filter((member) => member.name);
  const matches: MentionMatch<M>[] = [];

  let i = 0;
  while (i < content.length) {
    if (content[i] === "@" && i + 1 < content.length) {
      const afterAt = content.slice(i + 1).toLowerCase();
      let best: MentionMatch<M> | null = null;

      for (const member of named) {
        if (!afterAt.startsWith(member.name.toLowerCase())) continue;
        const end = i + 1 + member.name.length;
        const nextChar = content[end];
        // Reject if the name runs straight into another letter (so "@Jo" does
        // not match member "John", and "@Ann" does not match "Anna").
        if (nextChar !== undefined && /[a-zA-Z]/.test(nextChar)) continue;
        if (!best || member.name.length > best.member.name.length) {
          best = { member, start: i, end };
        }
      }

      if (best) {
        matches.push(best);
        i = best.end;
        continue;
      }
    }
    i += 1;
  }

  return matches;
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
