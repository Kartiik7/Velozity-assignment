import { Router } from "express";
import { z } from "zod";
import { Role, TaskStatus, TaskPriority } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { asyncHandler } from "../middleware/errorHandler";
import { verifyToken } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { taskFilterSchema, buildTaskWhere } from "../lib/taskFilters";
import { emitActivityEvent, emitNotification } from "../lib/socket";

// ─────────────────────────────────────────────
// Tasks router
// Mounted at /projects/:projectId/tasks  (nested)
// Also supports flat GET /tasks (cross-project, mounted separately)
// ─────────────────────────────────────────────

const router = Router({ mergeParams: true }); // mergeParams: inherit :projectId

// ─────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(300),
  description: z.string().max(5000).optional(),
  assignedDeveloperId: z
    .string()
    .cuid("assignedDeveloperId must be a valid CUID")
    .nullable()
    .optional(),
  priority: z
    .enum([
      TaskPriority.LOW,
      TaskPriority.MEDIUM,
      TaskPriority.HIGH,
      TaskPriority.CRITICAL,
    ])
    .optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
});

const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(5000).nullable().optional(),
    assignedDeveloperId: z.string().cuid().nullable().optional(),
    status: z
      .enum([
        TaskStatus.TODO,
        TaskStatus.IN_PROGRESS,
        TaskStatus.IN_REVIEW,
        TaskStatus.DONE,
      ])
      .optional(),
    priority: z
      .enum([
        TaskPriority.LOW,
        TaskPriority.MEDIUM,
        TaskPriority.HIGH,
        TaskPriority.CRITICAL,
      ])
      .optional(),
    dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided to update",
  });

// Developer can only patch status — strict() rejects any extra fields
const developerUpdateSchema = z
  .object({
    status: z.enum([
      TaskStatus.TODO,
      TaskStatus.IN_PROGRESS,
      TaskStatus.IN_REVIEW,
      TaskStatus.DONE,
    ]),
  })
  .strict(); // Reject any fields beyond `status`

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Verify the caller has access to the given project.
 * Returns the project or throws AppError(404).
 *
 * - Admin: any project
 * - PM: only projects they created
 * - Developer: no project access (enforced at route level before this is called)
 */
async function resolveProjectAccess(projectId: string, userId: string, role: Role) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw AppError.notFound("Project");

  if (role === Role.PM && project.createdById !== userId) {
    throw AppError.notFound("Project"); // 404, not 403 — don't reveal existence
  }

  return project;
}


// ─────────────────────────────────────────────
// POST /projects/:projectId/tasks
// Allowed: ADMIN, PM (own project only)
// ─────────────────────────────────────────────

router.post(
  "/",
  verifyToken,
  requireRole([Role.ADMIN, Role.PM]),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { sub: userId, role } = req.user!;

    if (projectId) {
      await resolveProjectAccess(projectId, userId, role as Role);
    } else {
      throw AppError.validation("projectId is required to create a task");
    }

    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.validation(
        "Invalid task data",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }

    const { assignedDeveloperId, dueDate, ...rest } = parsed.data;

    // Verify assigned developer exists and has DEVELOPER role
    if (assignedDeveloperId) {
      const dev = await prisma.user.findUnique({
        where: { id: assignedDeveloperId },
      });
      if (!dev || dev.role !== Role.DEVELOPER) {
        throw AppError.validation(
          "assignedDeveloperId must reference an existing user with role DEVELOPER"
        );
      }
    }

    const task = await prisma.task.create({
      data: {
        ...rest,
        projectId,
        assignedDeveloperId: assignedDeveloperId ?? null,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    });

    if (assignedDeveloperId) {
      const notification = await prisma.notification.create({
        data: {
          userId: assignedDeveloperId,
          type: "TASK_ASSIGNED",
          message: `You have been assigned to a new task: ${task.title}`,
        },
      });
      emitNotification(assignedDeveloperId, notification);
    }

    res.status(201).json({ data: task });
  })
);

// ─────────────────────────────────────────────
// GET /projects/:projectId/tasks — list tasks with filters
// Allowed: ADMIN, PM (own project), DEVELOPER (own assigned tasks)
// ─────────────────────────────────────────────

router.get(
  "/",
  verifyToken,
  requireRole([Role.ADMIN, Role.PM, Role.DEVELOPER]),
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { sub: userId, role } = req.user!;

    // Parse query filters
    const filterResult = taskFilterSchema.safeParse(req.query);
    if (!filterResult.success) {
      throw AppError.validation(
        "Invalid filter parameters",
        filterResult.error.flatten().fieldErrors as Record<string, string[]>
      );
    }
    const filters = filterResult.data;

    // Build base ownership constraint
    let baseWhere: Parameters<typeof buildTaskWhere>[1] = {};

    if (projectId) {
      baseWhere.projectId = projectId;
      if (role === Role.PM) {
        // PM must own the project
        await resolveProjectAccess(projectId, userId, Role.PM);
      }
    } else {
      if (role === Role.PM) {
        // Global PM view — restrict to projects they own
        baseWhere.project = { createdById: userId };
      }
    }

    if (role === Role.DEVELOPER) {
      // Developer can only see their own assigned tasks
      baseWhere.assignedDeveloperId = userId;
    }
    // Admin: no additional constraint

    const where = buildTaskWhere(filters, baseWhere);
    const skip = (filters.page - 1) * filters.limit;

    const [tasks, total] = await prisma.$transaction([
      prisma.task.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { createdAt: "desc" }],
        include: {
          assignedDeveloper: { select: { id: true, email: true } },
        },
      }),
      prisma.task.count({ where }),
    ]);

    res.json({
      data: tasks,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        pages: Math.ceil(total / filters.limit),
      },
    });
  })
);

// ─────────────────────────────────────────────
// GET /projects/:projectId/tasks/:id — get single task
// ─────────────────────────────────────────────

router.get(
  "/:id",
  verifyToken,
  requireRole([Role.ADMIN, Role.PM, Role.DEVELOPER]),
  asyncHandler(async (req, res) => {
    const { projectId, id } = req.params;
    const { sub: userId, role } = req.user!;

    if (projectId && role === Role.PM) {
      await resolveProjectAccess(projectId, userId, Role.PM);
    }

    // Pass projectId dynamically or just fetch by id if global
    const task = await prisma.task.findFirst({
      where: { id, ...(projectId ? { projectId } : {}) },
    });
    if (!task) throw AppError.notFound("Task");

    if (role === Role.DEVELOPER && task.assignedDeveloperId !== userId) {
      throw AppError.notFound("Task");
    }
    
    if (role === Role.PM && !projectId) {
       // if global fetch, we still need to verify the PM owns it
       await resolveProjectAccess(task.projectId, userId, Role.PM);
    }

    // Include activity log for the detail view
    const taskWithLogs = await prisma.task.findUnique({
      where: { id: task.id },
      include: {
        assignedDeveloper: { select: { id: true, email: true } },
        activityLogs: {
          orderBy: { changedAt: "desc" },
          take: 20,
          include: { user: { select: { id: true, email: true } } },
        },
      },
    });

    res.json({ data: taskWithLogs });
  })
);

// ─────────────────────────────────────────────
// PATCH /projects/:projectId/tasks/:id — update task
//
// ADMIN / PM (own project): any field
// DEVELOPER (own task): status only
// ─────────────────────────────────────────────

router.patch(
  "/:id",
  verifyToken,
  requireRole([Role.ADMIN, Role.PM, Role.DEVELOPER]),
  asyncHandler(async (req, res) => {
    const { projectId, id } = req.params;
    const { sub: userId, role } = req.user!;

    if (projectId && role === Role.PM) {
      await resolveProjectAccess(projectId, userId, Role.PM);
    }

    const task = await prisma.task.findFirst({
      where: { id, ...(projectId ? { projectId } : {}) },
    });
    if (!task) throw AppError.notFound("Task");

    if (role === Role.DEVELOPER && task.assignedDeveloperId !== userId) {
      throw AppError.notFound("Task");
    }

    if (role === Role.PM && !projectId) {
       await resolveProjectAccess(task.projectId, userId, Role.PM);
    }

    // Parse update body based on role
    let updateData: Record<string, unknown>;

    if (role === Role.DEVELOPER) {
      const parsed = developerUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.validation(
          "Developers can only update the task status field",
          parsed.error.flatten().fieldErrors as Record<string, string[]>
        );
      }
      updateData = parsed.data;
    } else {
      const parsed = updateTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        throw AppError.validation(
          "Invalid task update data",
          parsed.error.flatten().fieldErrors as Record<string, string[]>
        );
      }

      // Convert dueDate string to Date object for Prisma
      const { dueDate, ...rest } = parsed.data;
      updateData = {
        ...rest,
        ...(dueDate !== undefined
          ? { dueDate: dueDate ? new Date(dueDate) : null }
          : {}),
      };
    }

    const statusChanged =
      updateData.status !== undefined && updateData.status !== task.status;

    let newLogId: string | null = null;

    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.task.update({
        where: { id: task.id },
        data: updateData,
        include: {
          assignedDeveloper: { select: { id: true, email: true } },
        },
      });

      if (statusChanged) {
        const log = await tx.taskActivityLog.create({
          data: {
            taskId: task.id,
            userId,
            fromStatus: task.status,
            toStatus: updateData.status as TaskStatus,
          },
        });
        newLogId = log.id;
      }

      return t;
    });

    // Emit real-time event AFTER the transaction commits
    if (statusChanged && newLogId) {
      // Compute 1-based task number (position in project ordered by createdAt)
      const siblings = await prisma.task.findMany({
        where:   { projectId: task.projectId },
        select:  { id: true },
        orderBy: { createdAt: "asc" },
      });
      const taskNumber = siblings.findIndex((t) => t.id === task.id) + 1;

      const actor = await prisma.user.findUnique({
        where:  { id: userId },
        select: { email: true },
      });

      const fromStatus = task.status as string;
      const toStatus   = updateData.status as string;
      const changedAt  = new Date();

      const actorName = actor?.email ?? userId;
      const message =
        `${actorName} moved Task #${taskNumber} from ${fromStatus} → ${toStatus} · just now`;

      emitActivityEvent({
        id:         newLogId,
        taskId:     task.id,
        taskTitle:  task.title,
        taskNumber,
        projectId:  task.projectId,
        actorName,
        fromStatus,
        toStatus,
        changedAt:  changedAt.toISOString(),
        message,
      });

      // Notification logic
      // 1. Task assigned to new developer
      const newAssigneeId = updateData.assignedDeveloperId as string | undefined;
      if (newAssigneeId && newAssigneeId !== task.assignedDeveloperId) {
        const notif = await prisma.notification.create({
          data: {
            userId: newAssigneeId,
            type: "TASK_ASSIGNED",
            message: `You have been assigned to task: ${updated.title}`,
          },
        });
        emitNotification(newAssigneeId, notif);
      }

      // 2. Status moved to IN_REVIEW (notify PM)
      if (toStatus === TaskStatus.IN_REVIEW) {
        const project = await prisma.project.findUnique({ where: { id: task.projectId } });
        if (project) {
          const notif = await prisma.notification.create({
            data: {
              userId: project.createdById,
              type: "STATUS_CHANGED",
              message: `Task moved to IN_REVIEW: ${updated.title}`,
            },
          });
          emitNotification(project.createdById, notif);
        }
      }
    }

    res.json({ data: updated });
  })
);

// ─────────────────────────────────────────────
// DELETE /projects/:projectId/tasks/:id
// Allowed: ADMIN, PM (own project)
// ─────────────────────────────────────────────

router.delete(
  "/:id",
  verifyToken,
  requireRole([Role.ADMIN, Role.PM]),
  asyncHandler(async (req, res) => {
    const { projectId, id } = req.params;
    const { sub: userId, role } = req.user!;

    if (role === Role.PM) {
      await resolveProjectAccess(projectId, userId, Role.PM);
    }

    const task = await prisma.task.findFirst({ where: { id, projectId } });
    if (!task) throw AppError.notFound("Task");

    await prisma.task.delete({ where: { id } });

    res.status(204).send();
  })
);

// ─────────────────────────────────────────────
// GET task activity log
// ─────────────────────────────────────────────

router.get(
  "/:id/activity",
  verifyToken,
  requireRole([Role.ADMIN, Role.PM]),
  asyncHandler(async (req, res) => {
    const { projectId, id } = req.params;
    const { sub: userId, role } = req.user!;

    if (role === Role.PM) {
      await resolveProjectAccess(projectId, userId, Role.PM);
    }

    const task = await prisma.task.findFirst({ where: { id, projectId } });
    if (!task) throw AppError.notFound("Task");

    const logs = await prisma.taskActivityLog.findMany({
      where: { taskId: id },
      orderBy: { changedAt: "desc" },
      include: { user: { select: { id: true, email: true } } },
    });

    res.json({ data: logs });
  })
);

export default router;
