import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";

import { sendEmail } from "@/lib/email";
import { InviteEmail } from "@/emails/invite-email";

import db from "./prisma";
import { ac, admin, editor, viewer } from "./permissions";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
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
        const inviteLink = `${APP_URL}/invitations?invitationId=${id}`;

        await sendEmail({
          to: email,
          subject: `You're invited to join ${org.name} on Planora`,
          react: InviteEmail({
            workspaceName: org.name,
            inviteLink,
            invitedByEmail: inviter.user.email,
          }),
        }).catch((error) => {
          console.error("[auth] Failed to send invitation email:", error);
        });
      },
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
