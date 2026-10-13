import { db } from "./db";
import { assignRoundRobin } from "./rank";
import { HttpError } from "./api";
import { currentRound } from "./contest";

export interface AssignmentRow {
  team_id: number;
  team_name: string;
  members: string | null;
  problem_id: number;
  problem_code: string;
  problem_title: string;
  assigned_at: number;
}

export function getAssignments(): AssignmentRow[] {
  return db
    .prepare(
      `SELECT a.team_id, t.name AS team_name, t.members,
              a.problem_id, p.code AS problem_code, p.title AS problem_title,
              a.assigned_at
       FROM assignments a
       JOIN teams t ON t.id = a.team_id
       JOIN problems p ON p.id = a.problem_id
       ORDER BY t.name COLLATE NOCASE`
    )
    .all() as AssignmentRow[];
}

export function getTeamAssignment(teamId: number): AssignmentRow | undefined {
  return db
    .prepare(
      `SELECT a.team_id, t.name AS team_name, t.members,
              a.problem_id, p.code AS problem_code, p.title AS problem_title,
              a.assigned_at
       FROM assignments a
       JOIN teams t ON t.id = a.team_id
       JOIN problems p ON p.id = a.problem_id
       WHERE a.team_id = ?`
    )
    .get(teamId) as AssignmentRow | undefined;
}

/**
 * Whether a team may take part in the current round. Teams that are not
 * shortlisted keep their account but are told they did not qualify.
 */
export function getTeamEligibility(teamId: number): {
  qualified: boolean;
  eligibleRound: number;
  round: number;
} {
  const round = currentRound();
  const row = db
    .prepare("SELECT eligible_round FROM teams WHERE id = ?")
    .get(teamId) as { eligible_round: number } | undefined;
  return {
    qualified: !!row && row.eligible_round >= round,
    eligibleRound: row?.eligible_round ?? 0,
    round,
  };
}

/**
 * Assign one problem to every team that is eligible for the current round and
 * does not have a problem yet.
 */
export function assignMissing(): number {
  const round = currentRound();
  const existing = new Set(
    (db.prepare("SELECT team_id FROM assignments").all() as { team_id: number }[]).map(
      (r) => r.team_id
    )
  );
  const teams = (
    db
      .prepare("SELECT id FROM teams WHERE eligible_round >= ? ORDER BY id")
      .all(round) as { id: number }[]
  )
    .map((r) => r.id)
    .filter((id) => !existing.has(id));
  if (teams.length === 0) return 0;

  const problems = (
    db.prepare("SELECT id FROM problems ORDER BY id").all() as { id: number }[]
  ).map((r) => r.id);
  if (problems.length === 0) throw new HttpError(400, "No problems in the database");

  const map = assignRoundRobin(teams, problems, shuffleSeed());
  const insert = db.prepare(
    "INSERT OR REPLACE INTO assignments (team_id, problem_id, assigned_at) VALUES (?, ?, ?)"
  );
  const tx = db.transaction(() => {
    const at = Date.now();
    for (const [teamId, problemId] of map) insert.run(teamId, problemId, at);
  });
  tx();
  return map.size;
}

/** Reassign every team from scratch. */
export function assignAll(): number {
  db.prepare("DELETE FROM assignments").run();
  return assignMissing();
}

/** Admin swap before the start. */
export function setTeamProblem(teamId: number, problemId: number): void {
  const team = db.prepare("SELECT id FROM teams WHERE id = ?").get(teamId);
  if (!team) throw new HttpError(404, "Team not found");
  const problem = db.prepare("SELECT id FROM problems WHERE id = ?").get(problemId);
  if (!problem) throw new HttpError(404, "Problem not found");
  db.prepare(
    "INSERT OR REPLACE INTO assignments (team_id, problem_id, assigned_at) VALUES (?, ?, ?)"
  ).run(teamId, problemId, Date.now());
}

function shuffleSeed(): () => number {
  // Math.random is fine; assignment only needs to look fair, not be reproducible.
  return Math.random;
}
