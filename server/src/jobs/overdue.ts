import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { emitActivityEvent } from "../lib/socket";
import { TaskStatus } from "@prisma/client";

// Run every 10 minutes to check for overdue tasks
export function startOverdueJob() {
  cron.schedule("*/10 * * * *", async () => {
    try {
      const now = new Date();
      
      const overdueTasks = await prisma.task.findMany({
        where: {
          dueDate: { lt: now },
          isOverdue: false,
          status: { not: TaskStatus.DONE }
        },
        include: {
          project: { select: { createdById: true } }
        }
      });

      if (overdueTasks.length === 0) return;

      console.log(`[Job] Marking ${overdueTasks.length} tasks as overdue...`);

      // We process sequentially or in batches if large. For this scope, sequential is fine.
      for (const task of overdueTasks) {
        const [, log] = await prisma.$transaction([
          prisma.task.update({
            where: { id: task.id },
            data: { isOverdue: true }
          }),
          prisma.taskActivityLog.create({
            data: {
              taskId: task.id,
              userId: task.project.createdById, // attributing system action to PM
              fromStatus: task.status,
              toStatus: task.status,
            }
          })
        ]);

        const siblings = await prisma.task.findMany({
          where: { projectId: task.projectId },
          select: { id: true },
          orderBy: { createdAt: "asc" }
        });
        const taskNumber = siblings.findIndex((t) => t.id === task.id) + 1;

        emitActivityEvent({
          id: log.id,
          taskId: task.id,
          taskTitle: task.title,
          taskNumber,
          projectId: task.projectId,
          actorName: "System",
          fromStatus: task.status,
          toStatus: task.status,
          changedAt: log.changedAt.toISOString(),
          message: `System marked Task #${taskNumber} as Overdue · just now`
        });
      }
    } catch (err) {
      console.error("[Job] Error in overdue scheduler:", err);
    }
  });
  console.log("⏱️  Overdue scheduler started (runs every 10 minutes)");
}
