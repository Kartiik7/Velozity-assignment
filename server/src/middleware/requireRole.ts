import { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";

// ─────────────────────────────────────────────
// requireRole — Role-based access control middleware factory
//
// Design philosophy:
//   Every protected route MUST explicitly declare which roles are allowed.
//   There is NO default "logged-in user can access" — the frontend cannot
//   be trusted to enforce roles, so every route enforces it at the API layer.
//
// Usage:
//   // Only ADMIN and PM can create projects
//   router.post('/projects',
//     verifyToken,
//     requireRole(['ADMIN', 'PM']),
//     createProjectHandler
//   );
//
//   // All authenticated users can view their profile
//   router.get('/me',
//     verifyToken,
//     requireRole(['ADMIN', 'PM', 'DEVELOPER']),
//     getMeHandler
//   );
//
// The middleware returns 401 if req.user is absent (verifyToken was skipped),
// and 403 if the user's role is not in the allowed list.
// ─────────────────────────────────────────────

export function requireRole(allowedRoles: Role[]) {
  return function (req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
      // verifyToken middleware was not applied before this middleware.
      // This is a developer mistake — fail loudly.
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message:
            "Authentication required. Ensure verifyToken middleware is applied before requireRole.",
        },
      });
      return;
    }

    const userRole = req.user.role as Role;

    if (!allowedRoles.includes(userRole)) {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: `Your role (${userRole}) does not have permission to access this resource.`,
          requiredRoles: allowedRoles,
        },
      });
      return;
    }

    next();
  };
}

// ─────────────────────────────────────────────
// Convenience helpers for common role combos
// ─────────────────────────────────────────────

/** Only ADMIN users */
export const adminOnly = requireRole([Role.ADMIN]);

/** ADMIN or PM */
export const adminOrPm = requireRole([Role.ADMIN, Role.PM]);

/** All authenticated roles */
export const allRoles = requireRole([Role.ADMIN, Role.PM, Role.DEVELOPER]);
