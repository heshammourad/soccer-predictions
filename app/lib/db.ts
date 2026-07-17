import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: pg.Pool | undefined;
};

const connectionString = process.env.DATABASE_URL;

if (!globalForPrisma.pool && connectionString) {
  globalForPrisma.pool = new pg.Pool({ connectionString });
}

if (!globalForPrisma.prisma && globalForPrisma.pool) {
  const adapter = new PrismaPg(globalForPrisma.pool);
  globalForPrisma.prisma = new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma!;
export const pool = globalForPrisma.pool!;
