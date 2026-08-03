import Link from "next/link";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";

import { AuthHeaderActions } from "./auth-header-actions";

export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <Link href="/" className="text-lg font-semibold">
          Planora
        </Link>
        <div className="flex items-center gap-2">
          <AuthHeaderActions hasSession={!!session} />
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
