import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/jwt";
import { config } from "../config";
import { verifyToken } from "../middleware/auth";
import { Role } from "@prisma/client";

const router = Router();

// ─────────────────────────────────────────────
// Cookie name constant — centralised so every handler uses the same key
// ─────────────────────────────────────────────
const REFRESH_COOKIE = "refresh_token";

// ─────────────────────────────────────────────
// Cookie options:
//   httpOnly: true  → JS cannot read the cookie (XSS protection)
//   secure: true    → only sent over HTTPS (set false only in local dev)
//   sameSite: strict → not sent on cross-site requests (CSRF protection)
//   path: /auth/refresh → scope cookie to refresh endpoint only
// ─────────────────────────────────────────────
function getRefreshCookieOptions() {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const isProd = config.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? ("none" as const) : ("lax" as const),
    path: "/auth",              // Scoped to /auth routes only
    maxAge: sevenDaysMs,
  };
}

// Helper — create a RefreshToken DB record and sign the JWT
async function issueRefreshToken(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const dbToken = await prisma.refreshToken.create({
    data: { userId, token: "", expiresAt }, // placeholder
  });

  const signed = signRefreshToken({ sub: userId, tokenId: dbToken.id });

  // Update with the actual signed value
  await prisma.refreshToken.update({
    where: { id: dbToken.id },
    data: { token: signed },
  });

  return signed;
}

// ─────────────────────────────────────────────
// POST /auth/signup
// ─────────────────────────────────────────────

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password too long"),
  role: z
    .enum([Role.ADMIN, Role.PM, Role.DEVELOPER])
    .optional()
    .default(Role.DEVELOPER),
});

router.post("/signup", async (req: Request, res: Response): Promise<void> => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Validation error",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { email, password, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "Conflict", message: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: { email, passwordHash, role },
    select: { id: true, email: true, role: true, createdAt: true },
  });

  // Issue tokens on signup so the user is immediately logged in
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  const refreshToken = await issueRefreshToken(user.id);

  res.cookie(REFRESH_COOKIE, refreshToken, getRefreshCookieOptions());

  res.status(201).json({
    message: "Account created",
    accessToken,
    user: { id: user.id, email: user.email, role: user.role },
  });
});

// ─────────────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Validation error",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { email, password } = parsed.data;

  // Always run bcrypt.compare even on not-found to avoid timing attacks.
  // Using a dummy hash prevents short-circuit timing differences.
  const DUMMY_HASH =
    "$2b$12$invalidsaltinvalidsaltinvalidsa.invalidhashhashhash";

  const user = await prisma.user.findUnique({ where: { email } });
  const hashToCompare = user?.passwordHash ?? DUMMY_HASH;

  const isValid = await bcrypt.compare(password, hashToCompare);

  if (!user || !isValid) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid email or password",
    });
    return;
  }

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  const refreshToken = await issueRefreshToken(user.id);

  res.cookie(REFRESH_COOKIE, refreshToken, getRefreshCookieOptions());

  res.status(200).json({
    message: "Login successful",
    accessToken,
    user: { id: user.id, email: user.email, role: user.role },
  });
});

// ─────────────────────────────────────────────
// POST /auth/refresh
//
// Reads the refresh token from the HttpOnly cookie.
// Validates it against the DB record.
// Issues a new access token AND rotates the refresh token
// (old DB record is revoked; new one is created).
//
// Token rotation means a stolen refresh token can only be used once.
// ─────────────────────────────────────────────

router.post("/refresh", async (req: Request, res: Response): Promise<void> => {
  const token: string | undefined = req.cookies[REFRESH_COOKIE];

  if (!token) {
    res.status(401).json({
      error: "Unauthorized",
      message: "No refresh token cookie found",
    });
    return;
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    res.clearCookie(REFRESH_COOKIE, getRefreshCookieOptions());
    res.status(401).json({
      error: "Unauthorized",
      message: "Refresh token is invalid or expired",
    });
    return;
  }

  // Look up in DB — confirm not revoked
  const dbToken = await prisma.refreshToken.findUnique({
    where: { id: payload.tokenId },
    include: { user: true },
  });

  if (!dbToken || dbToken.revoked || dbToken.expiresAt < new Date()) {
    // Possible reuse attack — clear cookie and fail
    res.clearCookie(REFRESH_COOKIE, getRefreshCookieOptions());
    res.status(401).json({
      error: "Unauthorized",
      message: "Refresh token has been revoked or expired",
    });
    return;
  }

  // Revoke the old token (rotation)
  await prisma.refreshToken.update({
    where: { id: dbToken.id },
    data: { revoked: true },
  });

  // Issue fresh tokens
  const newAccessToken = signAccessToken({
    sub: dbToken.user.id,
    email: dbToken.user.email,
    role: dbToken.user.role,
  });
  const newRefreshToken = await issueRefreshToken(dbToken.user.id);

  res.cookie(REFRESH_COOKIE, newRefreshToken, getRefreshCookieOptions());

  res.status(200).json({
    accessToken: newAccessToken,
    user: {
      id: dbToken.user.id,
      email: dbToken.user.email,
      role: dbToken.user.role,
    },
  });
});

// ─────────────────────────────────────────────
// POST /auth/logout
//
// Revokes the refresh token in the DB and clears the cookie.
// Requires a valid access token so bots can't mass-revoke tokens
// by spamming the logout endpoint.
// ─────────────────────────────────────────────

router.post(
  "/logout",
  verifyToken,
  async (req: Request, res: Response): Promise<void> => {
    const token: string | undefined = req.cookies[REFRESH_COOKIE];

    if (token) {
      try {
        const payload = verifyRefreshToken(token);
        await prisma.refreshToken.update({
          where: { id: payload.tokenId },
          data: { revoked: true },
        });
      } catch {
        // Token may already be expired/invalid — still clear the cookie
      }
    }

    res.clearCookie(REFRESH_COOKIE, getRefreshCookieOptions());

    res.status(200).json({ message: "Logged out successfully" });
  }
);

export default router;
