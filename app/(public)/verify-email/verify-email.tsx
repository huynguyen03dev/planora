"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { verifyEmail } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

function VerifyEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"verifying" | "success" | "error">(
    token ? "verifying" : "error",
  );
  const [error, setError] = useState(
    token ? "" : "Missing verification token.",
  );

  useEffect(() => {
    if (!token) return;

    const safeToken = token;
    let cancelled = false;

    async function process() {
      try {
        const res = await verifyEmail({
          query: { token: safeToken },
        });

        if (cancelled) return;

        // Guard against an undefined/thrown result so a transient API
        // failure surfaces as an accessible error instead of crashing.
        if (!res || res.error) {
          setStatus("error");
          setError(
            res?.error?.message ?? "Invalid or expired verification link.",
          );
          return;
        }

        setStatus("success");

        // Redirect to boards after brief delay to show success feedback
        setTimeout(() => {
          router.push("/boards");
        }, 1500);
      } catch {
        if (cancelled) return;
        setStatus("error");
        setError("Invalid or expired verification link.");
      }
    }

    process();

    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (status === "verifying") {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            {/* Real page-level heading (CardTitle is a div). */}
            <h1 className="text-2xl leading-normal font-medium">Verifying your email</h1>
            <CardDescription>
              Please wait while we verify your email address.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Verifying...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            {/* Real page-level heading (CardTitle is a div). */}
            <h1 className="text-2xl leading-normal font-medium">Email verified!</h1>
            <CardDescription>
              Your email has been verified. Taking you to your boards...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Error state
  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          {/* Real page-level heading (CardTitle is a div). */}
          <h1 className="text-2xl leading-normal font-medium">Verification failed</h1>
          {/* U7: the specific failure message lives only in the role="alert"
              below — never duplicated in the description. */}
          <CardDescription>
            This verification link is invalid or has expired. Please request a new one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <p
              id="verify-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-4 pt-0">
          <Button className="w-full" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export function VerifyEmail() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
