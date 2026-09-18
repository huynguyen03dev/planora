"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { sendVerificationEmail, signUp } from "@/lib/auth-client";
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

type SignUpFieldError = "name" | "confirmPassword" | null;

function subscribeToHydration(): () => void {
  return () => undefined;
}

function getClientHydrationSnapshot(): boolean {
  return true;
}

function getServerHydrationSnapshot(): boolean {
  return false;
}

function verificationHref(
  email: string,
  callbackURL: string,
  delivery: "sent" | "failed",
): string {
  const params = new URLSearchParams({ email, callbackURL, delivery });
  return `/verify-email?${params.toString()}`;
}

export function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitedEmail = searchParams.get("email") ?? "";
  const redirectTo = safeInternalPath(searchParams.get("redirect") ?? undefined);
  const signInHref = `/sign-in${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  const [name, setName] = useState("");
  const [email, setEmail] = useState(invitedEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<SignUpFieldError>(null);
  const [loading, setLoading] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setFieldError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required");
      setFieldError("name");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setFieldError("confirmPassword");
      return;
    }

    setLoading(true);

    try {
      await signUp.email(
        {
          name: trimmedName,
          email,
          password,
          callbackURL: redirectTo,
        },
        {
          async onSuccess() {
            try {
              const result = await sendVerificationEmail({
                email,
                callbackURL: redirectTo,
              });
              router.push(
                verificationHref(
                  email,
                  redirectTo,
                  result && !result.error ? "sent" : "failed",
                ),
              );
            } catch {
              router.push(verificationHref(email, redirectTo, "failed"));
            }
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

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-2xl leading-normal font-medium">Create an account</h1>
          <CardDescription>
            Enter your details to get started with Planora.
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={handleSubmit}
          data-auth-hydrated={hydrated ? "true" : "false"}
        >
          <CardContent className="space-y-4">
            {error ? (
              <p id="form-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (fieldError === "name") {
                    setError("");
                    setFieldError(null);
                  }
                }}
                required
                autoComplete="name"
                autoFocus
                aria-invalid={fieldError === "name"}
                aria-describedby={fieldError === "name" ? "form-error" : undefined}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                aria-invalid={false}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                aria-invalid={false}
                aria-describedby="pw-help"
              />
              <p id="pw-help" className="text-sm text-muted-foreground">
                Minimum 8 characters
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  if (fieldError === "confirmPassword") {
                    setError("");
                    setFieldError(null);
                  }
                }}
                required
                minLength={8}
                autoComplete="new-password"
                aria-invalid={fieldError === "confirmPassword"}
                aria-describedby={
                  fieldError === "confirmPassword" ? "form-error" : undefined
                }
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-6">
            <Button
              type="submit"
              className="w-full"
              disabled={!hydrated || loading}
            >
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
