import Link from "next/link";

import { verifySession } from "@/lib/dal";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await verifySession();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <Link href="/boards" className="text-lg font-semibold">
          Planora
        </Link>
        <div className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
          U
        </div>
      </header>
      {children}
    </div>
  );
}
