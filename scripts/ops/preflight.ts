import db from "@/lib/prisma";
import { getRedis } from "@/lib/realtime/scale";

type Check = { name: string; ok: boolean; detail: string };

async function main() {
  const checks: Check[] = [];
  const required = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "CRON_SECRET"];
  for (const name of required) {
    checks.push({
      name: `env:${name}`,
      ok: Boolean(process.env[name]),
      detail: process.env[name] ? "configured" : "missing",
    });
  }

  try {
    await db.$queryRaw`SELECT 1`;
    checks.push({ name: "postgres", ok: true, detail: "query succeeded" });
  } catch (error) {
    checks.push({ name: "postgres", ok: false, detail: String(error) });
  }

  if (process.env.REDIS_URL) {
    try {
      const redis = await getRedis();
      checks.push({ name: "redis", ok: (await redis?.ping()) === "PONG", detail: "PING/PONG" });
    } catch (error) {
      checks.push({ name: "redis", ok: false, detail: String(error) });
    }
  } else {
    checks.push({ name: "redis", ok: true, detail: "not configured; single-instance mode" });
  }

  const cloudinaryNames = [
    "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME",
    "NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ];
  const cloudinaryReady = cloudinaryNames.every((name) => Boolean(process.env[name]));
  checks.push({
    name: "cloudinary-config",
    ok: cloudinaryReady || process.env.NODE_ENV !== "production",
    detail: cloudinaryReady ? "all credentials present" : "credentials incomplete",
  });

  const hasMail = Boolean(process.env.RESEND_API_KEY) || (process.env.NODE_ENV !== "production" && Boolean(process.env.SMTP_HOST));
  checks.push({
    name: "mail-transport",
    ok: hasMail,
    detail: hasMail ? "configured" : "no valid transport for this environment",
  });

  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name} — ${check.detail}`);
  }

  await db.$disconnect();
  process.exit(checks.every((check) => check.ok) ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
