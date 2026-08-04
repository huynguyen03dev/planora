"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn, sendVerificationEmail } from "@/lib/auth-client";
import { safeInternalPath } from "@/lib/redirect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SignInForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? undefined;
  const redirectTo = safeInternalPath(redirect);
  const invitedEmail = searchParams.get("email") ?? "";
  // Preserve invite context when bouncing to the sign-up link.
  const signUpHref = `/sign-up${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const [email, setEmail] = useState(invitedEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // U4: sign-in to an unverified account is a dead end without an action.
  // When Better Auth rejects with EMAIL_NOT_VERIFIED, offer a resend path.
  const [emailNeedsVerification, setEmailNeedsVerification] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setEmailNeedsVerification(false);
    setLoading(true);

    try {
      await signIn.email(
        {
          email,
          password,
          callbackURL: redirectTo,
        },
        {
          onError(ctx) {
            setError(ctx.error.message);
            // requireEmailVerification (decision 0023) makes sign-in return
            // code EMAIL_NOT_VERIFIED (message "Email not verified"). Match
            // the code, with a message-text fallback for robustness.
            if (
              ctx.error.code === "EMAIL_NOT_VERIFIED" ||
              /email.{0,20}not verified/i.test(ctx.error.message)
            ) {
              setEmailNeedsVerification(true);
            }
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
      // Enumeration-safe: stay silent on failure, like the sign-up resend path.
    } finally {
      setResendLoading(false);
    }
  }

  const hasError = Boolean(error);

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>
            Sign in to your Planora account.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <p id="form-error" role="alert" className="text-sm text-destructive">{error}</p>
            )}
            {emailNeedsVerification ? (
              <div className="space-y-2 rounded-md bg-muted p-3 text-sm">
                <p className="text-muted-foreground">
                  Your email address hasn&apos;t been verified yet. We sent a
                  verification link when you signed up — check your inbox (and
                  spam folder), or request a new one.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleResend}
                  disabled={resendLoading}
                >
                  {resendLoading ? "Sending..." : "Resend verification email"}
                </Button>
                {resendSent ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    Verification email sent — check your inbox.
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                  setEmailNeedsVerification(false);
                  setResendSent(false);
                }}
                required
                autoComplete="email"
                aria-invalid={hasError}
                aria-describedby={hasError ? "form-error" : undefined}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                aria-invalid={hasError}
                aria-describedby={hasError ? "form-error" : undefined}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-6">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link
                href={signUpHref}
                className="text-primary underline-offset-4 hover:underline"
              >
                Sign up
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
