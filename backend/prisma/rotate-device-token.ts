import { deviceService } from "../src/modules/device/device.service";
import { prisma } from "../src/prisma/client";

async function main(): Promise<void> {
  const device = await prisma.device.findFirst();
  if (!device) {
    throw new Error("No device found. Run `npm run seed` first.");
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

main()
  .catch((err) => {
    console.error("Rotation failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
