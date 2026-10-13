import { db } from "@/lib/db";
import { getStatus } from "@/lib/contest";
import { judgeQueue } from "@/lib/queue";
import { recentEvents } from "@/lib/events";
import { handler, ok, requireRole } from "@/lib/api";

export const runtime = "nodejs";

/** Live monitor: last activity and submission counts per team for the current round. */
export const GET = handler(async () => {
  await requireRole("admin");

  const status = getStatus();
  const round = status.currentRound;

  const teams = db
    .prepare(
      `SELECT t.id, t.name, t.eligible_round,
              (SELECT COUNT(*) FROM submissions s WHERE s.team_id = t.id AND s.round = ?) AS submissions,
              (SELECT MAX(s.created_at) FROM submissions s WHERE s.team_id = t.id AND s.round = ?) AS last_submission,
              (SELECT COUNT(*) FROM submissions s WHERE s.team_id = t.id AND s.round = ? AND s.status = 'PENDING') AS pending,
              (SELECT COUNT(*) FROM submissions s WHERE s.team_id = t.id AND s.round = ? AND s.judged_at IS NULL) AS in_flight,
              (SELECT MAX(s.created_at) FROM submissions s WHERE s.team_id = t.id AND s.round = ? AND s.status NOT IN ('PENDING','JUDGING')) AS last_judged
       FROM teams t
       ORDER BY t.name COLLATE NOCASE`
    )
    .all(round, round, round, round, round);

  return ok({
    contest: status,
    round,
    teams,
    queuePending: judgeQueue.pending,
    events: recentEvents(60),
    serverNow: Date.now(),
  });
});
