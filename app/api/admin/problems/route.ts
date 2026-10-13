import { db } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { handler, HttpError, ok, readJson, requireRole } from "@/lib/api";

export const runtime = "nodejs";

interface TestInput {
  input?: string;
  expected?: string;
  is_sample?: boolean | number;
}

export const GET = handler(async () => {
  await requireRole("admin");
  const problems = db
    .prepare(
      `SELECT p.id, p.code, p.title, p.pattern, p.time_limit_ms, p.created_at,
              (SELECT COUNT(*) FROM test_cases t WHERE t.problem_id = p.id AND t.is_sample = 1) AS samples,
              (SELECT COUNT(*) FROM test_cases t WHERE t.problem_id = p.id AND t.is_sample = 0) AS hidden,
              (SELECT COUNT(*) FROM assignments a WHERE a.problem_id = p.id) AS assigned
       FROM problems p
       ORDER BY p.code COLLATE NOCASE`
    )
    .all();
  return ok({ problems });
});

export const POST = handler(async (req: Request) => {
  await requireRole("admin");
  const body = await readJson<{
    code?: string;
    title?: string;
    statement?: string;
    pattern?: string;
    timeLimitMs?: number;
    tests?: TestInput[];
  }>(req);

  const code = (body.code ?? "").trim();
  const title = (body.title ?? "").trim();
  const statement = (body.statement ?? "").trim();
  if (!code || !title || !statement) {
    throw new HttpError(400, "code, title and statement are required");
  }
  const exists = db.prepare("SELECT id FROM problems WHERE code = ?").get(code);
  if (exists) throw new HttpError(409, "A problem with that code already exists");

  const info = db
    .prepare(
      `INSERT INTO problems (code, title, statement, pattern, time_limit_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      code,
      title,
      statement,
      body.pattern ?? null,
      Number(body.timeLimitMs) > 0 ? Number(body.timeLimitMs) : 2000,
      Date.now()
    );
  const problemId = Number(info.lastInsertRowid);

  if (Array.isArray(body.tests) && body.tests.length) {
    const insert = db.prepare(
      `INSERT INTO test_cases (problem_id, input, expected, is_sample, ordinal)
       VALUES (?, ?, ?, ?, ?)`
    );
    body.tests.forEach((t, i) => {
      insert.run(
        problemId,
        t.input ?? "",
        t.expected ?? "",
        t.is_sample ? 1 : 0,
        i
      );
    });
  }

  logEvent("problem-create", null, code);
  return ok({ id: problemId, code });
});
