import { TaskStatus, TaskPriority, Prisma } from "@prisma/client";
import { z } from "zod";

// ─────────────────────────────────────────────
// Task filter query params schema
//
// All params are optional; unrecognised values are rejected (no silent ignore).
// Date strings must be ISO 8601 for unambiguous parsing.
// ─────────────────────────────────────────────

export const taskFilterSchema = z.object({
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
  dueDateFrom: z.string().datetime({ offset: true }).optional(),
  dueDateTo: z.string().datetime({ offset: true }).optional(),
  projectId: z.string().cuid("projectId must be a valid CUID").optional(),
  assignedDeveloperId: z
    .string()
    .cuid("assignedDeveloperId must be a valid CUID")
    .optional(),
  isOverdue: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type TaskFilterParams = z.infer<typeof taskFilterSchema>;

/**
 * Build a Prisma `where` clause from validated filter params.
 * Callers may pre-populate `baseWhere` to layer ownership checks
 * (e.g. restrict to projects owned by the current PM).
 */
export function buildTaskWhere(
  filters: TaskFilterParams,
  baseWhere: Prisma.TaskWhereInput = {}
): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = { ...baseWhere };

  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.projectId) where.projectId = filters.projectId;
  if (filters.assignedDeveloperId)
    where.assignedDeveloperId = filters.assignedDeveloperId;
  if (filters.isOverdue !== undefined) where.isOverdue = filters.isOverdue;

  if (filters.dueDateFrom || filters.dueDateTo) {
    where.dueDate = {
      ...(filters.dueDateFrom ? { gte: new Date(filters.dueDateFrom) } : {}),
      ...(filters.dueDateTo ? { lte: new Date(filters.dueDateTo) } : {}),
    };
  }

  return where;
}
