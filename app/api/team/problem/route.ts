import { db } from "@/lib/db";
import { getTeamAssignment, getTeamEligibility } from "@/lib/assign";
import { getStatus, roundTiming } from "@/lib/contest";
import { findRoundSubmission } from "@/lib/submissions";
import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/api";

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

  // Current round timing + the team's one-shot submission, so the UI can show
  // "Your time" ticking from the round start and freeze it at submission.
  const status = getStatus();
  const round = status.currentRound;
  const roundStartedAtMs = roundTiming(round)?.started_at ?? status.startedAt;
  const submission = findRoundSubmission(session.teamId, round);
  const submitted = submission !== undefined;
  const submittedAtMs = submission?.created_at ?? null;

  // Teams that were not shortlisted cannot see or work on a problem.
  if (!eligibility.qualified) {
    return ok({
      qualified: false,
      assigned: false,
      round: eligibility.round,
      roundStartedAtMs,
      submitted,
      submittedAtMs,
      problem: null,
    });
  }

  const assignment = getTeamAssignment(session.teamId);

  if (!assignment) {
    return ok({
      qualified: true,
      assigned: false,
      round: eligibility.round,
      roundStartedAtMs,
      submitted,
      submittedAtMs,
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
      roundStartedAtMs,
      submitted,
      submittedAtMs,
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
    roundStartedAtMs,
    submitted,
    submittedAtMs,
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
