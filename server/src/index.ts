import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { config } from "./config";
import { prisma } from "./lib/prisma";
import { initSocket } from "./lib/socket";
import { errorHandler } from "./middleware/errorHandler";
import { startOverdueJob } from "./jobs/overdue";
import healthRouter from "./routes/health";
import authRouter from "./routes/auth";
import projectsRouter from "./routes/projects";
import tasksRouter from "./routes/tasks";
import dashboardRouter from "./routes/dashboard";
import notificationsRouter from "./routes/notifications";

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: config.NODE_ENV === "production" ? undefined : false,
  })
);

app.use(
  cors({
    origin: config.CLIENT_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

if (config.NODE_ENV !== "test") {
  app.use(morgan(config.NODE_ENV === "production" ? "combined" : "dev"));
}

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/projects", projectsRouter);
app.use("/projects/:projectId/tasks", tasksRouter);
app.use("/tasks", tasksRouter); // Global tasks list
app.use("/dashboard", dashboardRouter);
app.use("/notifications", notificationsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route does not exist" } });
});

app.use(errorHandler);

// ── Create HTTP server so Socket.io can share the same port ──────────────────
// Tests import `app` directly (no socket needed for REST tests).
// The httpServer + socket are only created when the process is the entry point.

export { app };

async function main() {
  try {
    await prisma.$connect();
    console.log("✅ Database connection established");

    const httpServer = http.createServer(app);
    initSocket(httpServer);
    
    startOverdueJob();

    httpServer.listen(config.PORT, () => {
      console.log(`🚀 Server running on http://localhost:${config.PORT}`);
      console.log(`   Socket.io ready`);
      console.log(`   Environment: ${config.NODE_ENV}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

process.on("SIGTERM", async () => { await prisma.$disconnect(); process.exit(0); });
process.on("SIGINT",  async () => { await prisma.$disconnect(); process.exit(0); });

if (require.main === module) {
  main();
}
