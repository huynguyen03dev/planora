const VALID_TIMEZONES: ReadonlySet<string> = (() => {
  try {
    return new Set(Intl.supportedValuesOf("timeZone"));
  } catch {
    return new Set<string>();
  }
})();

export function isValidTimezone(timezone: string): boolean {
  return VALID_TIMEZONES.has(timezone);
}

export function resolveTimezone(timezone: string | null | undefined): string {
  if (timezone && isValidTimezone(timezone)) {
    return timezone;
  }
  return "UTC";
}
