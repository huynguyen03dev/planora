"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { resetPassword } from "@/lib/auth-client";
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

function ResetPasswordFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [confirmationError, setConfirmationError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setConfirmationError(false);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setConfirmationError(true);
      return;
    }

    setLoading(true);

    try {
      if (!token) {
        setError("Missing reset token. Please use the link from your email.");
        return;
      }

      const res = await resetPassword({
        newPassword: password,
        token,
      });

      if (!res || res.error) {
        setError(res?.error?.message ?? "Something went wrong");
        return;
      }

      router.push("/sign-in");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Token is absent or empty — show an accessible error state.
  if (!token) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            {/* Real page-level heading (CardTitle is a div). */}
            <h1 className="text-2xl leading-normal font-medium">
              Invalid or expired link
            </h1>
            <CardDescription>
              This password reset link is missing or has already been used.
              Please request a new one.
            </CardDescription>
          </CardHeader>
          <CardFooter className="pt-0">
            <Button className="w-full" asChild>
              <Link href="/forgot-password">Request new reset link</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const hasError = Boolean(error) && !confirmationError;

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          {/* Real page-level heading (CardTitle is a div). */}
          <h1 className="text-2xl leading-normal font-medium">
            Set new password
          </h1>
          <CardDescription>Enter your new password below.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <p
                id="form-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {error}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
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
              <p id="pw-help" className="text-sm text-muted-foreground">
                Minimum 8 characters
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-new-password">Confirm new password</Label>
              <Input
                id="confirm-new-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  if (confirmationError) {
                    setError("");
                    setConfirmationError(false);
                  }
                }}
                required
                minLength={8}
                autoComplete="new-password"
                aria-invalid={confirmationError}
                aria-describedby={confirmationError ? "form-error" : undefined}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-6">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Resetting..." : "Reset password"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export function ResetPasswordForm() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordFormInner />
    </Suspense>
  );
}
