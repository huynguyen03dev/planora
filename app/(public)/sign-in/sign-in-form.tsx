"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { signIn } from "@/lib/auth-client";
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

function verificationHref(email: string, callbackURL: string): string {
  const params = new URLSearchParams({ email, callbackURL });
  return `/verify-email?${params.toString()}`;
}

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeInternalPath(searchParams.get("redirect") ?? undefined);
  const invitedEmail = searchParams.get("email") ?? "";
  const signUpHref = `/sign-up${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const [email, setEmail] = useState(invitedEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signIn.email(
        { email, password, callbackURL: redirectTo },
        {
          onError(ctx) {
            const needsVerification =
              ctx.error.code === "EMAIL_NOT_VERIFIED" ||
              /email.{0,20}not verified/i.test(ctx.error.message);

            if (needsVerification) {
              router.push(verificationHref(email, redirectTo));
              return;
            }

            setError(ctx.error.message);
          },
        },
      );
    } finally {
      setLoading(false);
    }
  }

  const hasError = Boolean(error);

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-2xl leading-normal font-medium">Welcome back</h1>
          <CardDescription>Sign in to your Planora account.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error ? (
              <p id="form-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                required
                autoComplete="email"
                autoFocus
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
                onChange={(event) => setPassword(event.target.value)}
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
