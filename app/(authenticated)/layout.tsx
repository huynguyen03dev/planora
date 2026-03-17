import Link from "next/link";

import { verifySession } from "@/lib/dal";
import { UserButton } from "@/components/user-button";

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
        <UserButton />
      </header>
      {children}
    </div>
  );
}
