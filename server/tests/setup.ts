import { beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma";

// ─────────────────────────────────────────────
// Global test setup
// ─────────────────────────────────────────────

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Clean all tables before each test in correct FK dependency order.
// Using deleteMany() in Prisma (instead of raw TRUNCATE) ensures
// Prisma's connection pool is fully committed before proceeding.
beforeEach(async () => {
  // Delete in leaf-to-root FK order to avoid constraint violations
  await prisma.notification.deleteMany();
  await prisma.taskActivityLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});
