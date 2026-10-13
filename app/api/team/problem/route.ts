import { db } from "@/lib/db";
import { getTeamAssignment, getTeamEligibility } from "@/lib/assign";
import { requireRole } from "@/lib/api";
import { handler, ok } from "@/lib/api";

export const runtime = "nodejs";

interface SampleRow {
  input: string;
  expected: string;
}

/**
 * The only problem payload a team ever receives: statement + sample tests.
 * Hidden tests, pass counts and scores are never selected here.
 */
export const GET = handler(async () => {
  const session = await requireRole("team");
  const eligibility = getTeamEligibility(session.teamId);

  // Teams that were not shortlisted cannot see or work on a problem.
  if (!eligibility.qualified) {
    return ok({
      qualified: false,
      assigned: false,
      round: eligibility.round,
      problem: null,
    });
  }

  const assignment = getTeamAssignment(session.teamId);

  if (!assignment) {
    return ok({
      qualified: true,
      assigned: false,
      round: eligibility.round,
      problem: null,
    });
  }

  const problem = db
    .prepare(
      "SELECT id, title, statement, time_limit_ms FROM problems WHERE id = ?"
    )
    .get(assignment.problem_id) as
    | { id: number; title: string; statement: string; time_limit_ms: number }
    | undefined;
  if (!problem) {
    return ok({
      qualified: true,
      assigned: false,
      round: eligibility.round,
      problem: null,
    });
  }

  const samples = db
    .prepare(
      `SELECT input, expected FROM test_cases
       WHERE problem_id = ? AND is_sample = 1
       ORDER BY ordinal, id`
    )
    .all(problem.id) as SampleRow[];

  return ok({
    qualified: true,
    assigned: true,
    round: eligibility.round,
    problem: {
      id: problem.id,
      code: assignment.problem_code,
      title: problem.title,
      statement: problem.statement,
      timeLimitMs: problem.time_limit_ms,
      samples,
    },
  });
});
