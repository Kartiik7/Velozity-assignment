import { Router } from "express";
import { Role, TaskStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { verifyToken } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { getConnectedUserCount } from "../lib/socket";

const router = Router();

router.get(
  "/stats",
  verifyToken,
  requireRole([Role.ADMIN, Role.PM, Role.DEVELOPER]),
  asyncHandler(async (req, res) => {
    const { sub: userId, role } = req.user!;
    const now = new Date();

    if (role === Role.ADMIN) {
      const [totalProjects, tasksByStatus, overdueCount] = await Promise.all([
        prisma.project.count(),
        prisma.task.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
        prisma.task.count({
          where: {
            dueDate: { lt: now },
            status: { not: TaskStatus.DONE },
          },
        }),
      ]);

      res.json({
        data: {
          totalProjects,
          tasksByStatus: tasksByStatus.reduce((acc, curr) => {
            acc[curr.status] = curr._count._all;
            return acc;
          }, {} as Record<string, number>),
          overdueCount,
          activeUsersOnline: getConnectedUserCount(),
        },
      });
      return;
    }

    if (role === Role.PM) {
      const next7Days = new Date();
      next7Days.setDate(next7Days.getDate() + 7);

      const [projectsSummary, tasksByPriority, upcomingDueDates] = await Promise.all([
        prisma.project.findMany({
          where: { createdById: userId },
          select: {
            id: true,
            name: true,
            _count: { select: { tasks: true } },
          },
        }),
        prisma.task.groupBy({
          by: ["priority"],
          where: { project: { createdById: userId } },
          _count: { _all: true },
        }),
        prisma.task.count({
          where: {
            project: { createdById: userId },
            dueDate: { gte: now, lte: next7Days },
            status: { not: TaskStatus.DONE },
          },
        }),
      ]);

      res.json({
        data: {
          projectsSummary,
          tasksByPriority: tasksByPriority.reduce((acc, curr) => {
            acc[curr.priority] = curr._count._all;
            return acc;
          }, {} as Record<string, number>),
          upcomingDueDates,
        },
      });
      return;
    }

    if (role === Role.DEVELOPER) {
      // The developer dashboard primary view is just their task list, 
      // but we can return some basic stats here to keep the API shape consistent.
      const [totalAssigned, openTasks] = await Promise.all([
        prisma.task.count({ where: { assignedDeveloperId: userId } }),
        prisma.task.count({ where: { assignedDeveloperId: userId, status: { not: TaskStatus.DONE } } }),
      ]);
      
      res.json({
        data: {
          totalAssigned,
          openTasks,
        }
      });
      return;
    }

    res.status(403).json({ error: "Unknown role" });
  })
);

router.get(
  "/clients",
  verifyToken,
  requireRole([Role.ADMIN, Role.PM]),
  asyncHandler(async (_req, res) => {
    const clients = await prisma.client.findMany({ select: { id: true, name: true } });
    res.json({ data: clients });
  })
);

export default router;
