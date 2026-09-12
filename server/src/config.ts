import { z } from "zod";

// ─────────────────────────────────────────────
// Config schema — validates all required env vars at startup.
// The app will crash immediately with a clear error if any are missing,
// rather than failing silently at the first DB call or JWT sign.
// ─────────────────────────────────────────────

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL URL"),
  ACCESS_TOKEN_SECRET: z
    .string()
    .min(32, "ACCESS_TOKEN_SECRET must be at least 32 characters"),
  REFRESH_TOKEN_SECRET: z
    .string()
    .min(32, "REFRESH_TOKEN_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("7d"),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  BCRYPT_ROUNDS: z.coerce.number().min(10).max(14).default(12),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:\n");
  parsed.error.errors.forEach((e) => {
    console.error(`  ${e.path.join(".")}: ${e.message}`);
  });
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
