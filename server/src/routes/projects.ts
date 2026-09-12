import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { asyncHandler } from "../middleware/errorHandler";
import { verifyToken } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

// ─────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────

const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional(),
  clientId: z.string().cuid("clientId must be a valid CUID"),
});

const updateProjectSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    clientId: z.string().cuid().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

// ─────────────────────────────────────────────
// Ownership guard helper
//
// Returns the project if the requesting user is allowed to access it.
// Admin → any project.
// PM   → only projects where createdById === userId.
// Throws AppError(404) rather than 403 for unknown IDs to avoid
// revealing whether a resource exists to unauthorized callers.
// ─────────────────────────────────────────────

async function resolveProject(projectId: string, userId: string, role: Role) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: { select: { id: true, name: true } } },
  });

  if (!project) throw AppError.notFound("Project");

  if (role !== Role.ADMIN && project.createdById !== userId) {
    // Return 404 — not 403 — to avoid confirming the project exists to non-owners
    throw AppError.notFound("Project");
  }

  return project;
}

// ─────────────────────────────────────────────
// POST /projects — create a project
// Allowed: ADMIN, PM
// ─────────────────────────────────────────────

router.post(
  "/",
  verifyToken,
  requireRole([Role.ADMIN, Role.PM]),
  asyncHandler(async (req, res) => {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.validation(
        "Invalid project data",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }

    const { name, description, clientId } = parsed.data;

    // Verify client exists
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw AppError.notFound("Client");

    const project = await prisma.project.create({
      data: {
        name,
        description,
        clientId,
        createdById: req.user!.sub,
      },
      include: {
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, email: true, role: true } },
      },
    });

    res.status(201).json({ data: project });
  })
);

// ─────────────────────────────────────────────
// GET /projects — list projects
// Admin: all projects. PM: only their own.
// ─────────────────────────────────────────────

router.get(
  "/",
  verifyToken,
  requireRole([Role.ADMIN, Role.PM]),
  asyncHandler(async (req, res) => {
    const { sub: userId, role } = req.user!;

    const where =
      role === Role.ADMIN
        ? {}
        : { createdById: userId };

    const projects = await prisma.project.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, email: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ data: projects, count: projects.length });
  })
);

// ─────────────────────────────────────────────
// GET /projects/:id — get single project
// ─────────────────────────────────────────────

router.get(
  "/:id",
  verifyToken,
  requireRole([Role.ADMIN, Role.PM]),
  asyncHandler(async (req, res) => {
    const project = await resolveProject(
      req.params.id,
      req.user!.sub,
      req.user!.role as Role
    );
    res.json({ data: project });
  })
);

// ─────────────────────────────────────────────
// PATCH /projects/:id — update project
// ─────────────────────────────────────────────

router.patch(
  "/:id",
  verifyToken,
  requireRole([Role.ADMIN, Role.PM]),
  asyncHandler(async (req, res) => {
    // Ownership check first
    await resolveProject(req.params.id, req.user!.sub, req.user!.role as Role);

    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.validation(
        "Invalid update data",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }

    const { clientId, ...rest } = parsed.data;

    // Verify new client exists if being changed
    if (clientId) {
      const client = await prisma.client.findUnique({ where: { id: clientId } });
      if (!client) throw AppError.notFound("Client");
    }

    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data: { ...rest, ...(clientId ? { clientId } : {}) },
      include: {
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, email: true } },
      },
    });

    res.json({ data: updated });
  })
);

// ─────────────────────────────────────────────
// DELETE /projects/:id — delete project (cascades tasks)
// ─────────────────────────────────────────────

router.delete(
  "/:id",
  verifyToken,
  requireRole([Role.ADMIN, Role.PM]),
  asyncHandler(async (req, res) => {
    await resolveProject(req.params.id, req.user!.sub, req.user!.role as Role);

    await prisma.project.delete({ where: { id: req.params.id } });

    res.status(204).send();
  })
);

export default router;
