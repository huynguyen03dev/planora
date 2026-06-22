import Link from "next/link";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

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
          {session ? (
            <Button size="sm" asChild>
              <Link href="/boards">Open app</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/sign-in">Sign In</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/sign-up">Sign Up</Link>
              </Button>
            </>
          )}
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
