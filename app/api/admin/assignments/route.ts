import { db } from "@/lib/db";
import { assignAll, assignMissing, getAssignments, setTeamProblem } from "@/lib/assign";
import { getStatus } from "@/lib/contest";
import { logEvent } from "@/lib/events";
import { handler, HttpError, ok, readJson, requireRole } from "@/lib/api";

export const runtime = "nodejs";

export const GET = handler(async () => {
  await requireRole("admin");
  const assignments = getAssignments();
  const status = getStatus();
  const teams = db
    .prepare("SELECT id, name, members, eligible_round FROM teams ORDER BY name COLLATE NOCASE")
    .all() as { id: number; name: string; members: string | null; eligible_round: number }[];
  const problems = db
    .prepare("SELECT id, code, title FROM problems ORDER BY code COLLATE NOCASE")
    .all();
  const assignedIds = new Set(assignments.map((a) => a.team_id));
  const unassigned = teams.filter(
    (t) => t.eligible_round >= status.currentRound && !assignedIds.has(t.id)
  );
  return ok({
    assignments,
    teams,
    problems,
    unassignedCount: unassigned.length,
    round: status.currentRound,
  });
});

export const POST = handler(async (req: Request) => {
  await requireRole("admin");
  const body = await readJson<{
    action?: string;
    teamId?: number;
    problemId?: number;
  }>(req);

  switch (body.action) {
    case "assign-all": {
      const n = assignAll();
      logEvent("assign-all", null, `${n} teams`);
      return ok({ assigned: n });
    }
    case "assign-missing": {
      const n = assignMissing();
      logEvent("assign-missing", null, `${n} teams`);
      return ok({ assigned: n });
    }
    case "swap": {
      if (typeof body.teamId !== "number" || typeof body.problemId !== "number") {
        throw new HttpError(400, "teamId and problemId are required");
      }
      setTeamProblem(body.teamId, body.problemId);
      logEvent("assign-swap", body.teamId, `problem ${body.problemId}`);
      return ok({ swapped: true });
    }
    default:
      throw new HttpError(400, "Unknown action");
  }
});
