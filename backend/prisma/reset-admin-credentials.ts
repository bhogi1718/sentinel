import bcrypt from "bcrypt";
import { prisma } from "../src/prisma/client";

const SALT_ROUNDS = 12;

async function main(): Promise<void> {
  const user = await prisma.user.findFirst();
  if (!user) {
    throw new Error("No admin user found. Run `npm run seed` first.");
  }

  console.log(`Current admin email: ${user.email}`);

  const [newEmail, newPassword] = process.argv.slice(2);
  if (!newEmail || !newPassword) {
    console.log("");
    console.log("No changes made - email printed above only. To set a new email + password, run:");
    console.log("  npx tsx prisma/reset-admin-credentials.ts 'you@example.com' 'YourNewPassword123'");
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({ where: { id: user.id }, data: { email: newEmail, passwordHash } });
  console.log(`Updated. New email: ${newEmail}`);
}

main()
  .catch((err) => {
    console.error("Reset failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
