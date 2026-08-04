import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
        Planora
      </h1>
      <p className="mt-4 max-w-md text-lg text-muted-foreground">
        Project management for teams
      </p>
      <div className="mt-8 flex items-center gap-3">
        <Button asChild>
          <Link href="/sign-up">Create free account</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    </div>
  );
}
