import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function BoardsNotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">Board not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The board you are looking for does not exist or you do not have access.
        </p>
        <Button asChild className="mt-5">
          <Link href="/boards">Back to boards</Link>
        </Button>
      </div>
    </div>
  );
}
