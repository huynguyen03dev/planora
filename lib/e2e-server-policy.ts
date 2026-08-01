type E2eServerEnvironment = Readonly<Record<string, string | undefined>>;

export function shouldReuseExistingE2eServer(
  environment: E2eServerEnvironment,
): boolean {
  return (
    !environment.CI && environment.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1"
  );
}
