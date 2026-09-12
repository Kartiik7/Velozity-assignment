import { Router, Request, Response } from "express";

const router = Router();

// ─────────────────────────────────────────────
// GET /health
//
// Used by Docker Compose healthcheck and load balancers to determine
// if the server process is up and the event loop is not blocked.
// Returns 200 with a timestamp so the caller can also detect clock drift.
// ─────────────────────────────────────────────

router.get("/", (_req: Request, res: Response): void => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

export default router;
