import { db } from "@/lib/db";
import { parseResults, rejudge } from "@/lib/submissions";
import { logEvent } from "@/lib/events";
import { handler, HttpError, ok, requireRole } from "@/lib/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  await requireRole("admin");
  const id = Number((await params).id);
  const sub = db
    .prepare(
      `SELECT s.*, t.name AS team_name, p.title AS problem_title
       FROM submissions s
       JOIN teams t ON t.id = s.team_id
       JOIN problems p ON p.id = s.problem_id
       WHERE s.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!sub) throw new HttpError(404, "Submission not found");
  return ok({
    submission: { ...sub, results: parseResults(String(sub.results)) },
  });
});

/** Rejudge a single submission (admin only). */
export const POST = handler(async (_req: Request, { params }: Ctx) => {
  await requireRole("admin");
  const id = Number((await params).id);
  const sub = db.prepare("SELECT id FROM submissions WHERE id = ?").get(id);
  if (!sub) throw new HttpError(404, "Submission not found");
  rejudge(id);
  logEvent("rejudge", null, `submission ${id}`);
  return ok({ rejudging: true });
});
