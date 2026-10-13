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
  /** Team display name when the event belongs to a team, else null. */
  team_name: string | null;
}

export function recentEvents(limit = 100): EventRow[] {
  return db
    .prepare(
      `SELECT e.id, e.at, e.kind, e.team_id, e.detail, e.ip_address, e.user_agent,
              t.name AS team_name
       FROM events e
       LEFT JOIN teams t ON t.id = e.team_id
       ORDER BY e.id DESC
       LIMIT ?`
    )
    .all(limit) as EventRow[];
}
