"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";

interface AuthHeaderActionsProps {
  /**
   * Authoritative session state from the server component, passed in to
   * avoid a hydration mismatch with `useSession()`'s initial render.
   */
  hasSession: boolean;
}

/**
 * Public-header CTA group. Hides the "Sign In" / "Sign Up" button that would
 * link to the page the user is already on, so the header never offers a
 * self-referential nav target.
 */
export function AuthHeaderActions({ hasSession }: AuthHeaderActionsProps) {
  const pathname = usePathname();
  const onSignIn = pathname === "/sign-in";
  const onSignUp = pathname === "/sign-up";

  if (hasSession) {
    return (
      <Button size="sm" asChild>
        <Link href="/boards">Open app</Link>
      </Button>
    );
  }

  return (
    <>
      {!onSignIn && (
        <Button variant="ghost" size="sm" asChild>
          <Link href="/sign-in">Sign In</Link>
        </Button>
      )}
      {!onSignUp && (
        <Button size="sm" asChild>
          <Link href="/sign-up">Sign Up</Link>
        </Button>
      )}
    </>
  );
}
