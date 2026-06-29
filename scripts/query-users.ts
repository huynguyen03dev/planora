import { db } from "../lib/prisma";
async function main() {
  const users = await db.user.findMany({ take: 5, select: { email: true, name: true } });
  console.log(JSON.stringify(users, null, 2));
  await db.$disconnect();
}
main();
