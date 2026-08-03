import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";

import { sendEmail } from "@/lib/email";
import { InviteEmail } from "@/emails/invite-email";
import { ResetPasswordEmail } from "@/emails/reset-password-email";
import { VerifyEmailEmail } from "@/emails/verify-email-email";

import db from "./prisma";
import { ac, admin, editor, viewer } from "./permissions";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// Origins allowed to send auth requests (CSRF allowlist), in addition to
// `baseURL` (which Better Auth always trusts). Comma-separated, set per
// environment; defaults to localhost for dev. Server-side only — do NOT prefix
// with NEXT_PUBLIC_ (the allowlist need not ship to the client).
const trustedOrigins = (
  process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? APP_URL,
  trustedOrigins,

  database: prismaAdapter(db, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    // NOTE (US-071): `requireEmailVerification` was enabled per decision 0023
    // (supersedes the 0018 deferral). Both email transport (RESEND_API_KEY
    // provisioned locally) and the E2E proof (unverified invite acceptance
    // blocked) are now addressable. The same transport dependency applies in
    // each target environment — see decision 0023 for the risk note.
    requireEmailVerification: true,

    sendResetPassword: async ({ user, token }) => {
      const resetLink = `${APP_URL}/reset-password?token=${token}`;

      await sendEmail({
        to: user.email,
        subject: "Reset your Planora password",
        react: ResetPasswordEmail({ resetLink }),
      }).catch((error) => {
        console.error("[auth] Failed to send reset password email:", error);
      });
    },
  },

  // Email verification config (US-071). `sendOnSignUp` defaults to following
  // `requireEmailVerification` behavior when not set.
  emailVerification: {
    sendVerificationEmail: async ({ user, token }) => {
      const verifyLink = `${APP_URL}/verify-email?token=${token}`;

      await sendEmail({
        to: user.email,
        subject: "Verify your Planora email",
        react: VerifyEmailEmail({ verifyLink }),
      }).catch((error) => {
        console.error("[auth] Failed to send verification email:", error);
      });
    },
    autoSignInAfterVerification: true,
    expiresIn: 3600, // 1 hour
  },

  // Explicit session lifetime (US-062 mn12): a 7-day absolute expiry, refreshed
  // at most once per day so an active session rolls forward without a write on
  // every request. Previously these were implicit Better Auth defaults; making
  // them explicit documents intent and pins them against a library default drift.
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh at most once per day
  },

  plugins: [
    organization({
      ac,
      roles: { admin, editor, viewer },
      creatorRole: "admin",
      schema: {
        organization: { modelName: "workspace" },
        member: { modelName: "workspaceMember" },
      },
      async sendInvitationEmail({
        email,
        id,
        organization: org,
        inviter,
      }) {
        const inviteLink = `${APP_URL}/invite?invitationId=${id}`;

        await sendEmail({
          to: email,
          subject: `You're invited to join ${org.name} on Planora`,
          react: InviteEmail({
            workspaceName: org.name,
            inviteLink,
            invitedByEmail: inviter.user.email,
          }),
          fromName: `${inviter.user.name ?? inviter.user.email.split("@")[0]} invited you to Planora`,
        }).catch((error) => {
          console.error("[auth] Failed to send invitation email:", error);
        });
      },
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
