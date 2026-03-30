import { PrismaClient, Role } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const vendor = await prisma.vendor.upsert({
    where: { code: "VENDOR-001" },
    update: {},
    create: {
      code: "VENDOR-001",
      name: "Default Vendor",
    },
  });

  const adminEmail = "admin@vlink.local";
  const passwordHash = await bcrypt.hash("admin1234", 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash,
      role: Role.ADMIN,
      name: "System Admin",
      vendorId: null,
    },
    create: {
      email: adminEmail,
      passwordHash,
      role: Role.ADMIN,
      name: "System Admin",
    },
  });

  const vendorUserEmail = "vendor@vlink.local";
  const vendorPasswordHash = await bcrypt.hash("vendor1234", 10);

  await prisma.user.upsert({
    where: { email: vendorUserEmail },
    update: {
      passwordHash: vendorPasswordHash,
      role: Role.VENDOR,
      name: "Vendor User",
      vendorId: vendor.id,
    },
    create: {
      email: vendorUserEmail,
      passwordHash: vendorPasswordHash,
      role: Role.VENDOR,
      name: "Vendor User",
      vendorId: vendor.id,
    },
  });
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
