import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";

import { sendEmail } from "@/lib/email";
import { InviteEmail } from "@/emails/invite-email";

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
    // NOTE (US-062 mn12): `requireEmailVerification` is intentionally NOT enabled
    // here yet. It is a pre-launch gate that must land together with a verified
    // transactional-email transport (RESEND_API_KEY provisioned) and an E2E proof
    // that an unverified account cannot accept an invitation — enabling it before
    // reliable delivery would lock every new signup out. Tracked in US-062 /
    // decision 0018.
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
