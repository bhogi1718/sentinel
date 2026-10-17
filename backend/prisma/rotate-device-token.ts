import { deviceService } from "../src/modules/device/device.service";
import { prisma } from "../src/prisma/client";

// Usage:
//   npx tsx prisma/rotate-device-token.ts              (when exactly one device exists)
//   npx tsx prisma/rotate-device-token.ts <deviceId>   (otherwise)
async function main(): Promise<void> {
  const deviceId = process.argv[2];

  const device = deviceId ? await prisma.device.findUnique({ where: { id: deviceId } }) : await findOnlyDevice();
  if (!device) {
    throw new Error(`No device with id ${deviceId}.`);
  }

  const token = deviceService.generateToken();
  await prisma.device.update({
    where: { id: device.id },
    data: { tokenHash: deviceService.hashToken(token) },
  });

  console.log(`Rotated token for device: ${device.name} (${device.id})`);
  console.log("");
  console.log("NEW DEVICE TOKEN (copy into agent.toml - shown only once):");
  console.log(token);
  console.log("");
}

// Without an explicit id, rotating is only unambiguous when there is exactly
// one device - with several (possibly across organizations) the caller has
// to say which one.
async function findOnlyDevice() {
  const devices = await prisma.device.findMany({
    take: 21,
    orderBy: { createdAt: "asc" },
    include: { org: { select: { name: true } } },
  });

  if (devices.length === 0) {
    throw new Error("No device found. Run `npm run seed` first.");
  }
  if (devices.length > 1) {
    const list = devices
      .slice(0, 20)
      .map((d) => `  ${d.id}  ${d.name}  (org: ${d.org.name})`)
      .join("\n");
    throw new Error(`More than one device exists - pass the id of the one to rotate:\n${list}`);
  }

  return devices[0];
}

main()
  .catch((err) => {
    console.error("Rotation failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
