import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import { Role } from "@prisma/client";
import { verifyAccessToken } from "./jwt";
import { prisma } from "./prisma";
import { config } from "../config";

// ── Types ─────────────────────────────────────

export interface ActivityEvent {
  id: string;           // TaskActivityLog.id
  taskId: string;
  taskTitle: string;
  taskNumber: number;   // 1-based position within project (display only)
  projectId: string;
  actorName: string;    // email of the user who made the change
  fromStatus: string;
  toStatus: string;
  changedAt: string;    // ISO string
  message: string;      // pre-formatted feed string
}

// Module-level io instance — set once by initSocket(), read by emitActivityEvent()
let io: SocketServer | null = null;

// Simple in-memory presence counter: userId → Set of socketIds
const onlineUsers = new Map<string, Set<string>>();

// ── Room name helpers ─────────────────────────

const projectRoom = (id: string) => `project:${id}`;
const userRoom    = (id: string) => `user:${id}`;
const adminRoom   = "admin:all";

// ── Relative time formatter ───────────────────

function relativeTime(date: Date): string {
  const diffMs  = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)  return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

// ── Format a TaskActivityLog row into the spec'd feed string ─────────────────

function formatMessage(
  actorName: string,
  taskNumber: number,
  fromStatus: string,
  toStatus: string,
  changedAt: Date
): string {
  return `${actorName} moved Task #${taskNumber} from ${fromStatus} → ${toStatus} · ${relativeTime(changedAt)}`;
}

// ── Fetch last-20 activity logs scoped to a user's role ─────────────────────

async function fetchCatchupLogs(
  userId: string,
  role: string
): Promise<ActivityEvent[]> {
  type LogWhere = NonNullable<Parameters<typeof prisma.taskActivityLog.findMany>[0]>["where"];
  let where: LogWhere = {};

  if (role === Role.DEVELOPER) {
    where = { task: { assignedDeveloperId: userId } };
  } else if (role === Role.PM) {
    where = { task: { project: { createdById: userId } } };
  }

  const logs = await prisma.taskActivityLog.findMany({
    where,
    orderBy: { changedAt: "desc" },
    take: 20,
    include: {
      user: { select: { email: true } },
      task: {
        select: {
          id: true,
          title: true,
          projectId: true,
          // position within project for task number
          project: { select: { tasks: { select: { id: true }, orderBy: { createdAt: "asc" } } } },
        },
      },
    },
  });

  return logs.map((log) => {
    const taskIndex = log.task.project.tasks.findIndex((t) => t.id === log.task.id);
    const taskNumber = taskIndex + 1;
    return {
      id:         log.id,
      taskId:     log.task.id,
      taskTitle:  log.task.title,
      taskNumber,
      projectId:  log.task.projectId,
      actorName:  log.user.email,
      fromStatus: log.fromStatus,
      toStatus:   log.toStatus,
      changedAt:  log.changedAt.toISOString(),
      message:    formatMessage(log.user.email, taskNumber, log.fromStatus, log.toStatus, log.changedAt),
    };
  });
}

// ── Initialize Socket.io ─────────────────────

export function initSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin:      config.CLIENT_ORIGIN,
      credentials: true,
    },
  });

  // ── Auth middleware ── runs before "connection" event
  io.use((socket, next) => {
    const token =
      (socket.handshake.auth.token as string | undefined) ||
      (socket.handshake.headers.authorization?.replace("Bearer ", "") ?? "");

    if (!token) {
      return next(new Error("UNAUTHORIZED"));
    }

    try {
      const payload = verifyAccessToken(token);
      // Attach to socket for use in connection handler
      (socket as AuthedSocket).user = {
        id:    payload.sub,
        email: payload.email,
        role:  payload.role,
      };
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", async (rawSocket) => {
    const socket = rawSocket as AuthedSocket;
    const { id: userId, role } = socket.user;

    // ── Join rooms ────────────────────────────
    // Always join the personal user room (for direct notifications)
    socket.join(userRoom(userId));

    if (role === Role.ADMIN) {
      socket.join(adminRoom);
    } else if (role === Role.PM) {
      // Join rooms for every project this PM created
      const projects = await prisma.project.findMany({
        where:  { createdById: userId },
        select: { id: true },
      });
      for (const p of projects) {
        socket.join(projectRoom(p.id));
      }
    } else if (role === Role.DEVELOPER) {
      // Join rooms for projects that have tasks assigned to this developer
      const tasks = await prisma.task.findMany({
        where:  { assignedDeveloperId: userId },
        select: { projectId: true },
      });
      const projectIds = [...new Set(tasks.map((t) => t.projectId))];
      for (const pid of projectIds) {
        socket.join(projectRoom(pid));
      }
    }

    // ── Presence ──────────────────────────────
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId)!.add(socket.id);
    io!.to(adminRoom).emit("presence:update", { connectedUsers: onlineUsers.size });

    // ── Reconnect catchup ─────────────────────
    // Send the last 20 relevant events from DB so the client is up to date
    try {
      const history = await fetchCatchupLogs(userId, role);
      socket.emit("activity:history", history);
    } catch (err) {
      console.error("[socket] catchup failed:", err);
    }

    // ── Disconnect ────────────────────────────
    socket.on("disconnect", () => {
      const sids = onlineUsers.get(userId);
      if (sids) {
        sids.delete(socket.id);
        if (sids.size === 0) onlineUsers.delete(userId);
      }
      io!.to(adminRoom).emit("presence:update", { connectedUsers: onlineUsers.size });
    });
  });

  return io;
}

// ── Emit an activity event to the correct scope ──────────────────────────────
//
// Called by the task PATCH handler after writing the ActivityLog row.
// Routing:
//   - Admin room    → always receives all events
//   - project:<id> → PM of the project + any developer in the project
//   - user:<devId>  → the assigned developer's personal room (redundant but safe)
//
// The developer's room join already scopes them to their assigned tasks,
// but emitting to the project room is sufficient because developers only
// join project rooms for projects where they have assigned tasks.

export async function emitActivityEvent(event: ActivityEvent): Promise<void> {
  if (!io) return; // Socket.io not initialized (e.g. during tests)

  // Admins always get everything
  io.to(adminRoom).emit("activity:event", event);

  // Project room — reaches PMs of this project + developers assigned to it
  io.to(projectRoom(event.projectId)).emit("activity:event", event);
}

// ── Get current online user count (for admin dashboard badge) ───────────────

export function getConnectedUserCount(): number {
  return onlineUsers.size;
}

// ── Emit a new notification to a specific user ─────────────────────────────

export function emitNotification(userId: string, notification: any): void {
  if (!io) return;
  io.to(userRoom(userId)).emit("notification:new", notification);
}

// ── Internal type ─────────────────────────────

interface AuthedSocket extends Socket {
  user: { id: string; email: string; role: string };
}
