import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, AccessTokenPayload } from "../lib/jwt";

// ─────────────────────────────────────────────
// Extend Express Request to carry the authenticated user
// ─────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

// ─────────────────────────────────────────────
// verifyToken middleware
//
// Reads the Bearer token from Authorization header and attaches the decoded
// payload to req.user. Does NOT check roles — that is requireRole's job.
//
// Separation of concerns:
//   verifyToken  → "Are you authenticated?"
//   requireRole  → "Do you have permission?"
//
// Usage:
//   router.get('/protected', verifyToken, requireRole(['ADMIN']), handler)
// ─────────────────────────────────────────────

export function verifyToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or malformed Authorization header. Expected: Bearer <token>",
      },
    });
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (err: unknown) {
    const isExpired =
      err instanceof Error && err.name === "TokenExpiredError";

    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: isExpired
          ? "Access token has expired. Use /auth/refresh to get a new one."
          : "Invalid access token.",
      },
    });
  }
}
