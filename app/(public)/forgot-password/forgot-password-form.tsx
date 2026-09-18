"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await requestPasswordReset({ email });

      if (!res || res.error) {
        setError(res?.error?.message ?? "Something went wrong");
        return;
      }

      // Neutral success — identical for known and unknown emails
      // (user-enumeration guard).
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Success swaps the whole form for a success card. Move focus to the new
  // heading (view-swap pattern, tabIndex=-1) so AT announce the changed state;
  // the user just submitted, so this is not a focus steal.
  const sentHeadingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (sent) {
      sentHeadingRef.current?.focus();
    }
  }, [sent]);

  if (sent) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <h1
              ref={sentHeadingRef}
              tabIndex={-1}
              className="text-2xl leading-normal font-medium outline-none"
            >
              Check your email
            </h1>
            <CardDescription>
              If an account exists for that email, we&apos;ve sent a password
              reset link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Didn&apos;t receive the email? Check your spam folder, or{" "}
              <button
                type="button"
                className="cursor-pointer text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  setSent(false);
                  setError("");
                }}
              >
                try again
              </button>
              .
            </p>
          </CardContent>
          <CardFooter className="pt-0">
            <Button variant="secondary" className="w-full" asChild>
              <Link href="/sign-in">Back to sign in</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const hasError = Boolean(error);

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          {/* Real page-level heading (CardTitle is a div). */}
          <h1 className="text-2xl leading-normal font-medium">Forgot password?</h1>
          <CardDescription>
            Enter your email and we&apos;ll send you a reset link.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <p id="form-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                aria-invalid={hasError}
                aria-describedby={hasError ? "form-error" : undefined}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-6">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Send reset link"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Remember your password?{" "}
              <Link
                href="/sign-in"
                className="text-primary underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
