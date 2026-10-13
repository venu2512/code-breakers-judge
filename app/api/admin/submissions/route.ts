import { db } from "@/lib/db";
import { handler, ok, requireRole } from "@/lib/api";

export const runtime = "nodejs";

export const GET = handler(async (req: Request) => {
  await requireRole("admin");
  const url = new URL(req.url);
  const problemId = Number(url.searchParams.get("problemId") || 0);
  const teamId = Number(url.searchParams.get("teamId") || 0);
  const round = Number(url.searchParams.get("round") || 0);
  const limit = Math.min(Number(url.searchParams.get("limit") || 200), 1000);

  const where: string[] = [];
  const params: unknown[] = [];
  if (problemId) {
    where.push("s.problem_id = ?");
    params.push(problemId);
  }
  if (teamId) {
    where.push("s.team_id = ?");
    params.push(teamId);
  }
  if (round) {
    where.push("s.round = ?");
    params.push(round);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const submissions = db
    .prepare(
      `SELECT s.id, s.team_id, t.name AS team_name, s.problem_id, p.title AS problem_title,
              s.round, s.language, s.status, s.passed, s.total, s.is_best,
              s.created_at, s.judged_at
       FROM submissions s
       JOIN teams t ON t.id = s.team_id
       JOIN problems p ON p.id = s.problem_id
       ${clause}
       ORDER BY s.created_at DESC
       LIMIT ?`
    )
    .all(...params, limit);
  return ok({ submissions });
});
