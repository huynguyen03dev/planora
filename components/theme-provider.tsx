"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Client wrapper so the root layout can stay a Server Component. next-themes
// injects a blocking pre-hydration script that resolves the stored/system theme
// and sets the `class` on <html> before first paint, so there is no flash of the
// wrong theme. Persistence is per-device via localStorage (US-046 non-goal:
// no DB-backed cross-device sync).
export function ThemeProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
