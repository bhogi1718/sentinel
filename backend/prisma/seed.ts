import bcrypt from "bcrypt";
import { env } from "../src/config/env";
import { deviceService } from "../src/modules/device/device.service";
import { prisma } from "../src/prisma/client";

const SALT_ROUNDS = 12;

// The same organization the multi-tenant migration creates for existing
// data, so a freshly seeded database and a migrated one look identical.
const DEFAULT_ORG = { name: "Personal", slug: "personal" } as const;

async function seedAdminUser(): Promise<string> {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env to run the seed script");
  }

  const existing = await prisma.user.findUnique({ where: { email: env.ADMIN_EMAIL } });
  if (existing) {
    console.log(`Admin user already exists for ${env.ADMIN_EMAIL}, skipping.`);
    return existing.id;
  }

  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { email: env.ADMIN_EMAIL, passwordHash },
  });

  console.log(`Created admin user: ${user.email} (${user.id})`);
  return user.id;
}

async function seedOrganization(ownerId: string): Promise<string> {
  const org = await prisma.organization.upsert({
    where: { slug: DEFAULT_ORG.slug },
    create: DEFAULT_ORG,
    update: {},
  });

  await prisma.membership.upsert({
    where: { userId_orgId: { userId: ownerId, orgId: org.id } },
    create: { userId: ownerId, orgId: org.id, role: "OWNER" },
    update: { role: "OWNER" },
  });

  console.log(`Organization "${org.name}" (${org.id}) is owned by the admin user.`);
  return org.id;
}

async function seedDevice(orgId: string): Promise<void> {
  if (!env.DEVICE_NAME) {
    throw new Error("DEVICE_NAME must be set in .env to run the seed script");
  }

  const existingCount = await prisma.device.count({ where: { orgId } });
  if (existingCount > 0) {
    console.log("The organization already has a device, skipping device seed.");
    return;
  }

  const token = deviceService.generateToken();
  const device = await prisma.device.create({
    data: { orgId, name: env.DEVICE_NAME, tokenHash: deviceService.hashToken(token) },
  });

  console.log(`Created device: ${device.name} (${device.id})`);
  console.log("");
  console.log("DEVICE TOKEN (copy this into the Rust agent's config - shown only once):");
  console.log(token);
  console.log("");
}

async function main(): Promise<void> {
  const ownerId = await seedAdminUser();
  const orgId = await seedOrganization(ownerId);
  await seedDevice(orgId);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
