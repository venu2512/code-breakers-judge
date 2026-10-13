import { LOGIN_RATE_LIMIT } from "./config";
import { ensureConfig } from "./bootstrap";

ensureConfig();

const globalForLimiter = globalThis as unknown as {
  __cbRate?: Map<string, number[]>;
};
const buckets = (globalForLimiter.__cbRate ??= new Map<string, number[]>());

/**
 * Sliding-window rate limiter. In-memory is fine: one server PC, one process.
 * Returns true when the action is allowed, false when the caller is over limit.
 */
export function allow(
  key: string,
  max = LOGIN_RATE_LIMIT.max,
  windowMs = LOGIN_RATE_LIMIT.windowMs
): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

/**
 * Per-team cooldowns keyed by action ("submit", "run"). In-memory is fine:
 * one server PC, one process.
 */
const globalForCooldown = globalThis as unknown as {
  __cbCooldown?: Map<string, number>;
};
const cooldowns = (globalForCooldown.__cbCooldown ??= new Map<string, number>());

function cooldownKey(kind: string, teamId: number): string {
  return `${kind}:${teamId}`;
}

/** Milliseconds remaining before the action is free again (0 = free). */
export function cooldownRemaining(kind: string, teamId: number, ms: number): number {
  const now = Date.now();
  const last = cooldowns.get(cooldownKey(kind, teamId)) ?? 0;
  const left = last + ms - now;
  return left > 0 ? left : 0;
}

/**
 * Check and reserve a cooldown in one synchronous step. Returns the
 * milliseconds remaining when the caller is over the limit (> 0), or 0 when
 * the slot was reserved. Because there is no await between the check and the
 * reservation, two concurrent requests from the same team cannot both pass.
 */
export function reserveCooldown(kind: string, teamId: number, ms: number): number {
  const left = cooldownRemaining(kind, teamId, ms);
  if (left > 0) return left;
  cooldowns.set(cooldownKey(kind, teamId), Date.now());
  return 0;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "local";
}
