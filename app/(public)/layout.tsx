import Link from "next/link";
import { headers } from "next/headers";

import { ThemeToggle } from "@/components/theme-toggle";
import { auth } from "@/lib/auth";

import { AuthHeaderActions } from "./auth-header-actions";

export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Planora
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <AuthHeaderActions hasSession={!!session} />
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
