"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { sendVerificationEmail, verifyEmail } from "@/lib/auth-client";
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
} from "@/components/ui/card";

type VerificationStatus = "request" | "verifying" | "success" | "error";

const resendCooldownSeconds = 30;
const resendFailureMessage =
  "We couldn't send the verification email. Please try again.";

function VerificationRequestForm({
  callbackURL,
  initialEmail,
  initialDelivery,
  tokenError,
}: {
  callbackURL: string;
  initialEmail: string;
  initialDelivery?: "sent" | "failed";
  tokenError?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState(
    initialDelivery === "failed" ? resendFailureMessage : "",
  );
  const [sent, setSent] = useState(initialDelivery === "sent");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(
    initialDelivery === "sent" ? resendCooldownSeconds : 0,
  );

  useEffect(() => {
    if (cooldown <= 0) return;

    const timeout = window.setTimeout(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [cooldown]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cooldown > 0) return;

    setError("");
    setSent(false);
    setLoading(true);

    try {
      const result = await sendVerificationEmail({ email, callbackURL });
      if (!result || result.error) {
        setError(resendFailureMessage);
        return;
      }

      setSent(true);
      setCooldown(resendCooldownSeconds);
    } catch {
      setError(resendFailureMessage);
    } finally {
      setLoading(false);
    }
  }

  const buttonLabel = loading
    ? "Sending..."
    : cooldown > 0
      ? `Send again in ${cooldown}s`
      : tokenError
        ? "Send new verification email"
        : "Send verification email";

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-2xl leading-normal font-medium">
            {tokenError ? "Verification failed" : "Verify your email"}
          </h1>
          <CardDescription>
            {tokenError
              ? "This verification link is invalid or has expired. Request a new one below."
              : "Enter your email and we'll send a verification link if your account needs one."}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {tokenError ? (
              <p role="alert" className="text-sm text-destructive">
                {tokenError}
              </p>
            ) : null}
            {error ? (
              <p id="verify-send-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {sent ? (
              <p role="status" className="text-sm text-muted-foreground">
                If an account needs verification, we&apos;ve sent a new link. Check
                your inbox and spam folder.
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="verification-email">Email</Label>
              <Input
                id="verification-email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                  setSent(false);
                }}
                placeholder="you@example.com"
                required
                autoComplete="email"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "verify-send-error" : undefined}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pt-6">
            <Button
              type="submit"
              className="w-full"
              disabled={loading || cooldown > 0}
            >
              {buttonLabel}
            </Button>
            <Button type="button" variant="secondary" className="w-full" asChild>
              <Link href="/sign-in">Back to sign in</Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

function VerifyEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const initialEmail = searchParams.get("email") ?? "";
  const delivery = searchParams.get("delivery");
  const initialDelivery =
    delivery === "sent" || delivery === "failed" ? delivery : undefined;
  const callbackURL = safeInternalPath(
    searchParams.get("callbackURL") ?? undefined,
  );
  const [status, setStatus] = useState<VerificationStatus>(
    token ? "verifying" : "request",
  );
  const [tokenError, setTokenError] = useState("");

  useEffect(() => {
    if (!token) return;

    const safeToken = token;
    let cancelled = false;

    async function process() {
      try {
        const result = await verifyEmail({ query: { token: safeToken } });
        if (cancelled) return;

        if (!result || result.error) {
          setStatus("error");
          setTokenError(
            result?.error?.message ?? "Invalid or expired verification link.",
          );
          return;
        }

        setStatus("success");
      } catch {
        if (cancelled) return;
        setStatus("error");
        setTokenError("Invalid or expired verification link.");
      }
    }

    void process();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (status !== "success") return;

    const timeout = window.setTimeout(() => {
      router.push(callbackURL);
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [callbackURL, router, status]);

  if (status === "request" || status === "error") {
    return (
      <VerificationRequestForm
        callbackURL={callbackURL}
        initialEmail={initialEmail}
        initialDelivery={initialDelivery}
        tokenError={status === "error" ? tokenError : undefined}
      />
    );
  }

  if (status === "verifying") {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <h1 className="text-2xl leading-normal font-medium">
              Verifying your email
            </h1>
            <CardDescription>
              Please wait while we verify your email address.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p role="status" className="text-sm text-muted-foreground">
              Verifying...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-2xl leading-normal font-medium">Email verified!</h1>
          <CardDescription>
            Your email has been verified. Taking you back to Planora...
          </CardDescription>
        </CardHeader>
        <CardFooter className="pt-0">
          <Button className="w-full" asChild>
            <Link href={callbackURL}>Continue</Link>
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
