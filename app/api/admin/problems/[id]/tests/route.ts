import { db } from "@/lib/db";
import { handler, HttpError, ok, readJson, requireRole } from "@/lib/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Add a test case to a problem. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  await requireRole("admin");
  const problemId = Number((await params).id);
  const problem = db.prepare("SELECT id FROM problems WHERE id = ?").get(problemId);
  if (!problem) throw new HttpError(404, "Problem not found");

  const body = await readJson<{
    input?: string;
    expected?: string;
    is_sample?: boolean;
  }>(req);
  if (typeof body.input !== "string" || typeof body.expected !== "string") {
    throw new HttpError(400, "input and expected are required");
  }

  const maxOrd = db
    .prepare("SELECT COALESCE(MAX(ordinal), -1) AS m FROM test_cases WHERE problem_id = ?")
    .get(problemId) as { m: number };

  const info = db
    .prepare(
      `INSERT INTO test_cases (problem_id, input, expected, is_sample, ordinal)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(problemId, body.input, body.expected, body.is_sample ? 1 : 0, maxOrd.m + 1);

  return ok({ id: Number(info.lastInsertRowid) });
});
