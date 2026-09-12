import jwt from "jsonwebtoken";
import { config } from "../config";

// ─────────────────────────────────────────────
// JWT utility — sign and verify access + refresh tokens.
//
// Access token:  short-lived (15m), carries userId + role for fast auth checks
//                without hitting the DB on every request.
// Refresh token: long-lived (7d), stored server-side in RefreshToken table
//                so it can be explicitly revoked. The token itself is stored
//                in an HttpOnly cookie — never accessible to JavaScript.
// ─────────────────────────────────────────────

export interface AccessTokenPayload {
  sub: string; // userId
  email: string;
  role: string;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string; // userId
  tokenId: string; // RefreshToken.id in DB — used for rotation/revocation
  type: "refresh";
}

// ── Access Token ──────────────────────────────

export function signAccessToken(
  payload: Omit<AccessTokenPayload, "type">
): string {
  return jwt.sign(
    { ...payload, type: "access" },
    config.ACCESS_TOKEN_SECRET,
    { expiresIn: config.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"] }
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, config.ACCESS_TOKEN_SECRET);
  if (
    typeof payload !== "object" ||
    payload === null ||
    (payload as AccessTokenPayload).type !== "access"
  ) {
    throw new Error("Invalid access token type");
  }
  return payload as AccessTokenPayload;
}

// ── Refresh Token ─────────────────────────────

export function signRefreshToken(
  payload: Omit<RefreshTokenPayload, "type">
): string {
  return jwt.sign(
    { ...payload, type: "refresh" },
    config.REFRESH_TOKEN_SECRET,
    { expiresIn: config.REFRESH_TOKEN_TTL as jwt.SignOptions["expiresIn"] }
  );
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = jwt.verify(token, config.REFRESH_TOKEN_SECRET);
  if (
    typeof payload !== "object" ||
    payload === null ||
    (payload as RefreshTokenPayload).type !== "refresh"
  ) {
    throw new Error("Invalid refresh token type");
  }
  return payload as RefreshTokenPayload;
}
