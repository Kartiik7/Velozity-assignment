import { PrismaClient } from "@prisma/client";
import { config } from "../config";

// ─────────────────────────────────────────────
// Singleton PrismaClient
//
// In development, ts-node-dev hot-reloads modules on change, which would create
// a new PrismaClient instance on every reload and exhaust the connection pool.
// We attach the instance to `globalThis` so it survives hot-reloads.
// In production, the module is loaded once and a single instance is used.
// ─────────────────────────────────────────────

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      config.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (config.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
