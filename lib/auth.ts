import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";

import prisma from "./prisma";
import { ac, admin, editor, viewer } from "./permissions";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),

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
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
