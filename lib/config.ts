// Central place for environment driven configuration.
// Server-only: never import this from a client component.
import { parseAllowedLanguages, type Language } from "./languages";

export type { Language } from "./languages";
export {
  ALL_LANGUAGES,
  LANGUAGE_LABELS,
  LANGUAGE_FILE,
  parseAllowedLanguages,
} from "./languages";

function numEnv(name: string, fallback: number): number {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const config = {
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "change-me-now",
  jwtSecret: process.env.JWT_SECRET || "dev-only-secret-change-me-please-32chars",
  defaultDurationMinutes: Number(process.env.CONTEST_DURATION_MINUTES || 45),
  // Number of rounds the event is planned to have (admin can change at runtime).
  totalRounds: numEnv("TOTAL_ROUNDS", 3),
  allowedLanguages: parseAllowedLanguages(process.env.ALLOWED_LANGUAGES),
  port: Number(process.env.PORT || 3000),
  javaMaxHeapMB: numEnv("JAVA_MAX_HEAP_MB", 256),
  // Address-space / heap cap for a running program, in MB. 0 disables it.
  memoryLimitMB: numEnv("MEMORY_LIMIT_MB", 512),
  judgeConcurrency: numEnv("JUDGE_CONCURRENCY", 3),
  compileTimeLimitMs: numEnv("COMPILE_TIME_LIMIT_MS", 10000),
  defaultTimeLimitMs: numEnv("DEFAULT_TIME_LIMIT_MS", 2000),
  outputCapBytes: numEnv("OUTPUT_CAP_BYTES", 100 * 1024),
  submitCooldownMs: numEnv("SUBMIT_COOLDOWN_MS", 15_000),
  runCooldownMs: numEnv("RUN_COOLDOWN_MS", 3_000),
};

export const OUTPUT_CAP_BYTES = config.outputCapBytes;
export const DEFAULT_TIME_LIMIT_MS = config.defaultTimeLimitMs;
export const COMPILE_TIME_LIMIT_MS = config.compileTimeLimitMs;
export const SUBMIT_COOLDOWN_MS = config.submitCooldownMs;
export const RUN_COOLDOWN_MS = config.runCooldownMs;
export const JUDGE_CONCURRENCY = config.judgeConcurrency;
export const LOGIN_RATE_LIMIT = { max: 5, windowMs: 60_000 };

// Re-export the type for callers that already import from ./config.
export type ConfigLanguage = Language;

export function validateConfig(): void {
  const badDefaults =
    config.adminPassword === "change-me-now" ||
    config.jwtSecret === "dev-only-secret-change-me-please-32chars";
  if (badDefaults) {
    throw new Error(
      "SECURITY: Default ADMIN_PASSWORD or JWT_SECRET detected. Set them in .env.local before starting."
    );
  }
  if (config.jwtSecret.length < 32) {
    throw new Error("SECURITY: JWT_SECRET must be at least 32 characters long.");
  }
  if (!config.adminUsername || config.adminUsername.trim().length === 0) {
    throw new Error("SECURITY: ADMIN_USERNAME cannot be empty.");
  }
  if (!config.adminPassword || config.adminPassword.trim().length === 0) {
    throw new Error("SECURITY: ADMIN_PASSWORD cannot be empty.");
  }
}
