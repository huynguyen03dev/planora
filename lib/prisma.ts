import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

// Bound the underlying pg pool so a burst of concurrent Server Actions can't
// open unbounded connections (Postgres refuses past max_connections) and idle
// connections are reclaimed. Overridable per environment via env.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  idleTimeoutMillis: Number(process.env.DATABASE_POOL_IDLE_MS ?? 30_000),
});

const globalForPrisma = global as unknown as { db: PrismaClient };

export const db =
  globalForPrisma.db ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.db = db;

export default db;
