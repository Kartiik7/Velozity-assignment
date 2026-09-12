import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError, ErrorCode } from "../lib/errors";
import { config } from "../config";

// ─────────────────────────────────────────────
// Centralized Error Handler
//
// Must be registered LAST in the Express middleware chain (after all routes).
// Catches anything passed to next(err) or thrown synchronously in async handlers.
//
// Response shape is ALWAYS:
//   { "error": { "code": string, "message": string, "details"?: object } }
//
// Stack traces are NEVER sent to the client in production.
// ─────────────────────────────────────────────

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // ── AppError (expected, typed) ──────────────
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // ── ZodError (validation failed without AppError wrapper) ──
  if (err instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of err.errors) {
      const path = issue.path.join(".") || "root";
      details[path] = [...(details[path] ?? []), issue.message];
    }
    res.status(400).json({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: "Request validation failed",
        details,
      },
    });
    return;
  }

  // ── Unknown / unexpected error ──────────────
  // Log the full error server-side for debugging, but never send raw details
  // to the client (stack trace, DB query text, internal paths, etc.)
  console.error("[Unhandled Error]", err);

  res.status(500).json({
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message:
        config.NODE_ENV === "production"
          ? "An unexpected error occurred"
          : err instanceof Error
            ? err.message
            : "Unknown error",
    },
  });
}

// ─────────────────────────────────────────────
// asyncHandler — wraps an async route handler so that promise rejections
// are automatically forwarded to next(err) rather than causing an
// unhandled promise rejection that crashes the process.
//
// Usage:
//   router.get('/something', asyncHandler(async (req, res) => { ... }))
// ─────────────────────────────────────────────

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
