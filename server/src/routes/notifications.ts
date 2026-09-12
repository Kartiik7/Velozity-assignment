import { Router } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { asyncHandler } from "../middleware/errorHandler";
import { verifyToken } from "../middleware/auth";

const router = Router();

// ─────────────────────────────────────────────
// GET /notifications — list unread or all notifications
// ─────────────────────────────────────────────
router.get(
  "/",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { sub: userId } = req.user!;
    
    const unreadOnly = req.query.unread === "true";

    const notifications = await prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const unreadCount = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    res.json({
      data: notifications,
      meta: { unreadCount },
    });
  })
);

// ─────────────────────────────────────────────
// PATCH /notifications/:id/read — mark one as read
// ─────────────────────────────────────────────
router.patch(
  "/:id/read",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { sub: userId } = req.user!;

    const notification = await prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) throw AppError.notFound("Notification");

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    res.json({ data: updated });
  })
);

// ─────────────────────────────────────────────
// POST /notifications/read-all — mark all as read
// ─────────────────────────────────────────────
router.post(
  "/read-all",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { sub: userId } = req.user!;

    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    res.json({ data: { count: result.count } });
  })
);

export default router;
