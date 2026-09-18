import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { safeInternalPath } from "@/lib/redirect";
import {
  Card,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

import { SignUpForm } from "./sign-up-form";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: redirectParam } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });

  // Already signed in — don't show the form; send them where they were headed.
  if (session) {
    redirect(safeInternalPath(redirectParam));
  }

  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center px-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              {/* Real page-level heading (CardTitle is a div). */}
              <h1 className="text-2xl leading-normal font-medium">Create an account</h1>
              <CardDescription>Loading sign up form...</CardDescription>
            </CardHeader>
          </Card>
        </div>
      }
    >
      <SignUpForm />
    </Suspense>
  );
}
