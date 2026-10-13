import { db } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { handler, HttpError, ok, readJson, requireRole } from "@/lib/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  await requireRole("admin");
  const id = Number((await params).id);
  const problem = db.prepare("SELECT * FROM problems WHERE id = ?").get(id);
  if (!problem) throw new HttpError(404, "Problem not found");
  const tests = db
    .prepare(
      "SELECT id, input, expected, is_sample, ordinal FROM test_cases WHERE problem_id = ? ORDER BY is_sample DESC, ordinal, id"
    )
    .all(id);
  return ok({ problem, tests });
});

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  await requireRole("admin");
  const id = Number((await params).id);
  const body = await readJson<{
    title?: string;
    statement?: string;
    pattern?: string;
    timeLimitMs?: number;
  }>(req);

  const problem = db.prepare("SELECT id FROM problems WHERE id = ?").get(id);
  if (!problem) throw new HttpError(404, "Problem not found");

  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.title !== undefined) {
    fields.push("title = ?");
    values.push(body.title.trim());
  }
  if (body.statement !== undefined) {
    fields.push("statement = ?");
    values.push(body.statement);
  }
  if (body.pattern !== undefined) {
    fields.push("pattern = ?");
    values.push(body.pattern);
  }
  if (body.timeLimitMs !== undefined) {
    fields.push("time_limit_ms = ?");
    values.push(Number(body.timeLimitMs) > 0 ? Number(body.timeLimitMs) : 2000);
  }
  if (fields.length === 0) throw new HttpError(400, "Nothing to update");

  db.prepare(`UPDATE problems SET ${fields.join(", ")} WHERE id = ?`).run(...values, id);
  logEvent("problem-update", null, String(id));
  return ok({ updated: true });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  await requireRole("admin");
  const id = Number((await params).id);
  const info = db.prepare("DELETE FROM problems WHERE id = ?").run(id);
  if (info.changes === 0) throw new HttpError(404, "Problem not found");
  logEvent("problem-delete", null, String(id));
  return ok({ deleted: true });
});
