import { rejudgeProblem } from "@/lib/submissions";
import { logEvent } from "@/lib/events";
import { handler, HttpError, ok, readJson, requireRole } from "@/lib/api";

export const runtime = "nodejs";

/** Rejudge every submission for one problem (e.g. after fixing a test case). */
export const POST = handler(async (req: Request) => {
  await requireRole("admin");
  const { problemId } = await readJson<{ problemId?: number }>(req);
  if (typeof problemId !== "number") throw new HttpError(400, "problemId required");
  const n = rejudgeProblem(problemId);
  logEvent("rejudge-problem", null, `problem ${problemId}, ${n} submissions`);
  return ok({ rejudging: n });
});
