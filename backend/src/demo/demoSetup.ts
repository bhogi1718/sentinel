import bcrypt from "bcrypt";
import crypto from "crypto";
import { deviceService } from "../modules/device/device.service";
import { prisma } from "../prisma/client";

/// The demo's fixed identity. The visitor account has no usable password
/// (demo sessions are issued by /api/demo/session) and belongs to the demo
/// organization only.
export const DEMO_ORG = { name: "Demo Company", slug: "demo" } as const;
export const DEMO_USER = { email: "visitor@demo.sentinel.invalid", name: "Demo visitor" } as const;
export const DEMO_DEVICE_NAME = "Demo laptop";

/// How long demo activity is kept. The simulator records an event every
/// minute or two; this keeps the shared demo small on a free database.
const DEMO_HISTORY_DAYS = 7;

export interface PreparedDemo {
  orgId: string;
  deviceId: string;
  /// Fresh on every start and never stored - only its hash is.
  deviceToken: string;
}

/// Creates (or brings up to date) the demo organization, visitor and device.
/// Idempotent, so it simply runs on every start when demo mode is on.
export async function prepareDemo(): Promise<PreparedDemo> {
  const existingOrg = await prisma.organization.findUnique({ where: { slug: DEMO_ORG.slug } });
  if (existingOrg && !existingOrg.isDemo) {
    // Never turn someone's real organization into the public demo.
    throw new Error(`An organization with slug "${DEMO_ORG.slug}" already exists and is not a demo organization`);
  }
  const org = existingOrg ?? (await prisma.organization.create({ data: { ...DEMO_ORG, isDemo: true } }));

  let visitor = await prisma.user.findUnique({ where: { email: DEMO_USER.email } });
  if (!visitor) {
    // A random password nobody knows - the account can't be logged into.
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
    visitor = await prisma.user.create({ data: { ...DEMO_USER, passwordHash } });
  }

  await prisma.membership.upsert({
    where: { userId_orgId: { userId: visitor.id, orgId: org.id } },
    create: { userId: visitor.id, orgId: org.id, role: "ADMIN" },
    update: { role: "ADMIN" },
  });
  // The visitor must never reach anything but the demo.
  await prisma.membership.deleteMany({ where: { userId: visitor.id, orgId: { not: org.id } } });

  const deviceToken = deviceService.generateToken();
  const tokenHash = deviceService.hashToken(deviceToken);
  const existingDevice = await prisma.device.findFirst({ where: { orgId: org.id, name: DEMO_DEVICE_NAME } });
  const device = existingDevice
    ? await prisma.device.update({ where: { id: existingDevice.id }, data: { tokenHash } })
    : await prisma.device.create({ data: { orgId: org.id, name: DEMO_DEVICE_NAME, tokenHash } });

  return { orgId: org.id, deviceId: device.id, deviceToken };
}

/// Drops demo activity older than the retention window, and demo sessions
/// that can no longer be refreshed.
export async function pruneDemoHistory(orgId: string): Promise<void> {
  const cutoff = new Date(Date.now() - DEMO_HISTORY_DAYS * 86_400_000);
  await prisma.event.deleteMany({ where: { orgId, occurredAt: { lt: cutoff } } });
  await prisma.command.deleteMany({ where: { orgId, requestedAt: { lt: cutoff } } });
  await prisma.refreshToken.deleteMany({
    where: { user: { email: DEMO_USER.email }, OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }] },
  });
}

export function isDemoUser(email: string): boolean {
  return email === DEMO_USER.email;
}
