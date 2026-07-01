/**
 * Escapes a value for a CSV cell and guards against formula injection
 * (CWE-1236): a string cell whose value begins with a character a
 * spreadsheet would interpret as a formula lead-in (`=`, `+`, `-`, `@`,
 * tab, CR) is prefixed with a single quote so it opens as text. Only
 * string-typed input is guarded — a genuine negative number passed as a
 * `number` (not a pre-formatted string) is left untouched.
 */
export function csvCell(value: string | number | boolean | null): string {
  const text = value == null ? "" : String(value);
  const guarded =
    typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded)
    ? `"${guarded.replaceAll("\"", "\"\"")}"`
    : guarded;
}
