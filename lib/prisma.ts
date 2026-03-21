import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

const globalForPrisma = global as unknown as { db: PrismaClient };

export const db =
  globalForPrisma.db ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.db = db;

export default db;
