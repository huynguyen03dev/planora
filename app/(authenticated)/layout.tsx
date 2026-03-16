import { verifySession } from "@/lib/dal";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await verifySession();

  return <>{children}</>;
}
