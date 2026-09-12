import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { signAccessToken } from "../src/lib/jwt";
import { config } from "../src/config";

// ─────────────────────────────────────────────
// Test helper: create a user in the DB and return a valid access token
// ─────────────────────────────────────────────

export async function createUser(opts: {
  email?: string;
  password?: string;
  role?: Role;
}) {
  const email = opts.email ?? `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = opts.password ?? "password123";
  const role = opts.role ?? Role.DEVELOPER;
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { email, passwordHash, role },
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });

  return { user, accessToken, password };
}

// ─────────────────────────────────────────────
// Test helper: create a client (external company)
// ─────────────────────────────────────────────

export async function createClient(name?: string) {
  return prisma.client.create({
    data: { name: name ?? `Client-${Date.now()}`, contactEmail: "contact@example.com" },
  });
}

// ─────────────────────────────────────────────
// Test helper: create a project owned by a PM
// ─────────────────────────────────────────────

export async function createProject(opts: {
  createdById: string;
  clientId: string;
  name?: string;
}) {
  return prisma.project.create({
    data: {
      name: opts.name ?? `Project-${Date.now()}`,
      clientId: opts.clientId,
      createdById: opts.createdById,
    },
  });
}

// ─────────────────────────────────────────────
// Test helper: create a task
// ─────────────────────────────────────────────

export async function createTask(opts: {
  projectId: string;
  title?: string;
  assignedDeveloperId?: string;
}) {
  return prisma.task.create({
    data: {
      title: opts.title ?? `Task-${Date.now()}`,
      projectId: opts.projectId,
      assignedDeveloperId: opts.assignedDeveloperId ?? null,
    },
  });
}

// ─────────────────────────────────────────────
// Adversarial helper: forge a JWT with a tampered role.
// The signature will be INVALID because we don't know the real secret.
// This simulates an attacker manually crafting a token.
// ─────────────────────────────────────────────

export function forgeToken(payload: {
  sub: string;
  email: string;
  role: string;
  type?: string;
}): string {
  // Sign with a WRONG secret — the server must reject this
  return jwt.sign(
    { ...payload, type: "access" },
    "attacker_does_not_know_this_secret",
    { expiresIn: "15m" }
  );
}

// ─────────────────────────────────────────────
// Adversarial helper: take a real token and replace the role claim.
// The original signature no longer matches → must be rejected.
// ─────────────────────────────────────────────

export function tamperRole(realToken: string, newRole: Role): string {
  // Decode without verification, rebuild payload with new role, sign with wrong key.
  // Strip exp/iat so jsonwebtoken can add fresh timing claims without conflict.
  const decoded = jwt.decode(realToken) as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { exp, iat, ...rest } = decoded;
  return jwt.sign(
    { ...rest, role: newRole, type: "access" },
    "wrong_secret",
    { expiresIn: "15m" }
  );
}

// ─────────────────────────────────────────────
// Bearer header shorthand
// ─────────────────────────────────────────────

export function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}
