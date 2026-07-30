import bcrypt from "bcrypt";
import { env } from "../src/config/env";
import { deviceService } from "../src/modules/device/device.service";
import { prisma } from "../src/prisma/client";

const SALT_ROUNDS = 12;

async function seedAdminUser(): Promise<void> {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env to run the seed script");
  }

  const existing = await prisma.user.findUnique({ where: { email: env.ADMIN_EMAIL } });
  if (existing) {
    console.log(`Admin user already exists for ${env.ADMIN_EMAIL}, skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { email: env.ADMIN_EMAIL, passwordHash },
  });

  console.log(`Created admin user: ${user.email} (${user.id})`);
}

async function seedDevice(): Promise<void> {
  if (!env.DEVICE_NAME) {
    throw new Error("DEVICE_NAME must be set in .env to run the seed script");
  }

  const existingCount = await prisma.device.count();
  if (existingCount > 0) {
    console.log("A device already exists, skipping device seed.");
    return;
  }

  const token = deviceService.generateToken();
  const device = await prisma.device.create({
    data: { name: env.DEVICE_NAME, tokenHash: deviceService.hashToken(token) },
  });

  console.log(`Created device: ${device.name} (${device.id})`);
  console.log("");
  console.log("DEVICE TOKEN (copy this into the Rust agent's config - shown only once):");
  console.log(token);
  console.log("");
}

async function main(): Promise<void> {
  await seedAdminUser();
  await seedDevice();
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
