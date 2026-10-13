import { db } from "@/lib/db";
import { handler, HttpError, ok, readJson, requireRole } from "@/lib/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; testId: string }> };

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  await requireRole("admin");
  const { testId } = await params;
  const id = Number(testId);
  const body = await readJson<{
    input?: string;
    expected?: string;
    is_sample?: boolean;
  }>(req);

  const fields: string[] = [];
  const values: unknown[] = [];
  if (typeof body.input === "string") {
    fields.push("input = ?");
    values.push(body.input);
  }
  if (typeof body.expected === "string") {
    fields.push("expected = ?");
    values.push(body.expected);
  }
  if (body.is_sample !== undefined) {
    fields.push("is_sample = ?");
    values.push(body.is_sample ? 1 : 0);
  }
  if (fields.length === 0) throw new HttpError(400, "Nothing to update");

  const info = db
    .prepare(`UPDATE test_cases SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values, id);
  if (info.changes === 0) throw new HttpError(404, "Test not found");
  return ok({ updated: true });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  await requireRole("admin");
  const { testId } = await params;
  const info = db.prepare("DELETE FROM test_cases WHERE id = ?").run(Number(testId));
  if (info.changes === 0) throw new HttpError(404, "Test not found");
  return ok({ deleted: true });
});
