import { db } from "./db";

export function logEvent(
  kind: string,
  teamId: number | null = null,
  detail?: string,
  ipAddress?: string | null,
  userAgent?: string | null
): void {
  try {
    db.prepare(
      "INSERT INTO events (at, kind, team_id, detail, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(Date.now(), kind, teamId, detail ?? null, ipAddress ?? null, userAgent ?? null);
  } catch {
    // Logging must never break a request.
  }
}

export function clientInfo(req: Request): { ip: string | null; ua: string | null } {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip") || null;
  const ua = req.headers.get("user-agent") || null;
  return { ip, ua };
}

export interface EventRow {
  id: number;
  at: number;
  kind: string;
  team_id: number | null;
  detail: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

export function recentEvents(limit = 100): EventRow[] {
  return db
    .prepare("SELECT * FROM events ORDER BY id DESC LIMIT ?")
    .all(limit) as EventRow[];
}
