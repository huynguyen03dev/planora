"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signUp, sendVerificationEmail } from "@/lib/auth-client";
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

export function SignUpForm() {
  const searchParams = useSearchParams();
  const invitedEmail = searchParams.get("email") ?? "";
  // Preserve invite context when bouncing to the sign-in link.
  const signInHref = `/sign-in${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  const [name, setName] = useState("");
  const [email, setEmail] = useState(invitedEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifyPending, setVerifyPending] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Trim before submit so a whitespace-only name cannot bypass the
    // `required` HTML attribute (browsers treat it as non-empty). Better
    // Auth does not enforce a non-empty name, so guard at the client.
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required");
      setLoading(false);
      return;
    }

    try {
      await signUp.email(
        { name: trimmedName, email, password },
        {
          onSuccess() {
            // With requireEmailVerification enabled (decision 0023),
            // BA does NOT create a session. Show the verify-pending
            // state instead of redirecting to /boards.
            setVerifyPending(true);
          },
          onError(ctx) {
            setError(ctx.error.message);
          },
        },
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResendLoading(true);
    setResendSent(false);

    try {
      await sendVerificationEmail({ email });
      setResendSent(true);
    } catch {
      // Error is surfaced by BA internally; we stay silent to
      // avoid leaking user-enumeration info.
    } finally {
      setResendLoading(false);
    }
  }

  const hasError = Boolean(error);

  // Verify-pending state: shown after successful sign-up instead of
  // redirecting to /boards, because requireEmailVerification is enabled.
  // The whole form is replaced by a success card, so focus moves to the
  // success heading (a one-time, view-swap focus move — not a steal: the
  // user just submitted and the content they were looking at is gone). A
  // tabIndex=-1 heading is the WAI-ARIA pattern for a changed view: AT
  // announce the new heading when it receives focus.
  const verifyPendingHeadingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (verifyPending) {
      verifyPendingHeadingRef.current?.focus();
    }
  }, [verifyPending]);

  if (verifyPending) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <h1
              ref={verifyPendingHeadingRef}
              tabIndex={-1}
              className="text-2xl leading-normal font-medium outline-none"
            >
              Check your email
            </h1>
            <CardDescription>
              We&apos;ve sent a verification link to <strong>{email}</strong>.
              Click the link to activate your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Didn&apos;t receive the email? Check your spam folder, or{" "}
              <button
                type="button"
                className="cursor-pointer text-primary underline-offset-4 hover:underline disabled:opacity-50"
                onClick={handleResend}
                disabled={resendLoading}
              >
                {resendLoading
                  ? "Sending..."
                  : resendSent
                    ? "Sent!"
                    : "resend"}
              </button>
              .
            </p>
            {/* Persistent polite live region: the visible "Sent!" flips on the
                button itself, which AT never announce (the button keeps focus).
                This always-mounted region announces the resend result once,
                each time it changes (it clears while the request is in flight
                so a repeat click re-announces). */}
            <p role="status" className="sr-only">
              {resendSent ? "Sent!" : ""}
            </p>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-0">
            <Button variant="secondary" className="w-full" asChild>
              <Link href={signInHref}>Sign in instead</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          {/* Real page-level heading (CardTitle is a div). */}
          <h1 className="text-2xl leading-normal font-medium">Create an account</h1>
          <CardDescription>
            Enter your details to get started with Planora.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <p id="form-error" role="alert" className="text-sm text-destructive">{error}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                autoFocus
                aria-invalid={hasError}
                aria-describedby={hasError ? "form-error" : undefined}
              />
            </div>
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
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                aria-invalid={hasError}
                aria-describedby={hasError ? "form-error pw-help" : "pw-help"}
              />
              <p id="pw-help" className="text-sm text-muted-foreground">Minimum 8 characters</p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-6">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Sign Up"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                href={signInHref}
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
