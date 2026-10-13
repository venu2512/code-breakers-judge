import { db } from "./db";
import { judge } from "./judge";
import { judgeQueue } from "./queue";
import { updateBestForTeam } from "./scoring";
import { currentRound } from "./contest";
import type { Language } from "./config";
import type { JudgeStatus, TestResult } from "./types";

export interface SubmissionRow {
  id: number;
  team_id: number;
  problem_id: number;
  round: number;
  language: Language;
  code: string;
  status: JudgeStatus;
  passed: number;
  total: number;
  results: string;
  is_best: number;
  created_at: number;
  judged_at: number | null;
}

function dbNow(): number {
  return Date.now();
}

/**
 * The team's submission for a round (one-shot rule: at most one per round).
 * Newest row wins; this is also the timestamp used to freeze the team timer.
 */
export function findRoundSubmission(
  teamId: number,
  round: number
): { id: number; created_at: number } | undefined {
  return db
    .prepare(
      "SELECT id, created_at FROM submissions WHERE team_id = ? AND round = ? ORDER BY id DESC LIMIT 1"
    )
    .get(teamId, round) as { id: number; created_at: number } | undefined;
}

/** True when the team already submitted for the current round. */
export function hasSubmittedThisRound(teamId: number): boolean {
  return findRoundSubmission(teamId, currentRound()) !== undefined;
}

/** Insert a submission in PENDING state and return its id. */
export function createSubmission(
  teamId: number,
  problemId: number,
  language: Language,
  code: string
): number {
  const info = db
    .prepare(
      `INSERT INTO submissions
         (team_id, problem_id, round, language, code, status, passed, total, results, is_best, created_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING', 0, 0, '[]', 0, ?)`
    )
    .run(teamId, problemId, currentRound(), language, code, dbNow());
  return Number(info.lastInsertRowid);
}

/** Run the hidden tests and store the outcome. Safe to call from the queue. */
export async function processSubmission(id: number): Promise<void> {
  const sub = db
    .prepare("SELECT * FROM submissions WHERE id = ?")
    .get(id) as SubmissionRow | undefined;
  if (!sub) return;

  db.prepare("UPDATE submissions SET status = 'JUDGING' WHERE id = ?").run(id);

  const outcome = await judge(sub.code, sub.language, sub.problem_id, "hidden");

  db.prepare(
    `UPDATE submissions
       SET status = ?, passed = ?, total = ?, results = ?, judged_at = ?
     WHERE id = ?`
  ).run(
    outcome.status,
    outcome.passed,
    outcome.total,
    JSON.stringify(outcome.results),
    dbNow(),
    id
  );

  updateBestForTeam(sub.team_id, sub.round);
}

/**
 * Re-enqueue submissions that were left PENDING/JUDGING by a crash or restart.
 * Runs at most once per process (guarded), so it is safe to call from anywhere.
 */
const globalForRequeue = globalThis as unknown as { __cbRequeued?: boolean };
export function requeueStuckSubmissions(): number {
  if (globalForRequeue.__cbRequeued) return 0;
  globalForRequeue.__cbRequeued = true;
  const stuck = db
    .prepare(
      "SELECT id FROM submissions WHERE judged_at IS NULL AND status IN ('PENDING','JUDGING') ORDER BY id"
    )
    .all() as { id: number }[];
  for (const s of stuck) {
    void judgeQueue.add(() => processSubmission(s.id)).catch((err) => {
      console.error(`[judge] requeue ${s.id} failed:`, err);
    });
  }
  if (stuck.length > 0) {
    console.log(`[judge] requeued ${stuck.length} unfinished submission(s) after restart`);
  }
  return stuck.length;
}

/** Insert + enqueue. Returns the new submission id immediately. */
export function submit(
  teamId: number,
  problemId: number,
  language: Language,
  code: string
): number {
  const id = createSubmission(teamId, problemId, language, code);
  void judgeQueue
    .add(() => processSubmission(id))
    .catch((err) => {
      console.error(`[judge] submission ${id} failed:`, err);
      try {
        db.prepare(
          "UPDATE submissions SET status = 'INTERNAL_ERROR', judged_at = ? WHERE id = ? AND status IN ('PENDING','JUDGING')"
        ).run(Date.now(), id);
      } catch {}
    });
  return id;
}

/** Rejudge an existing submission (admin only). */
export function rejudge(id: number): void {
  db.prepare(
    "UPDATE submissions SET status = 'PENDING', judged_at = NULL WHERE id = ?"
  ).run(id);
  void judgeQueue
    .add(() => processSubmission(id))
    .catch((err) => {
      console.error(`[judge] rejudge ${id} failed:`, err);
      try {
        db.prepare(
          "UPDATE submissions SET status = 'INTERNAL_ERROR', judged_at = ? WHERE id = ? AND status IN ('PENDING','JUDGING')"
        ).run(Date.now(), id);
      } catch {}
    });
}

export function rejudgeProblem(problemId: number): number {
  const ids = (
    db
      .prepare("SELECT id FROM submissions WHERE problem_id = ?")
      .all(problemId) as { id: number }[]
  ).map((r) => r.id);
  for (const id of ids) rejudge(id);
  return ids.length;
}

export function parseResults(json: string): TestResult[] {
  try {
    return JSON.parse(json) as TestResult[];
  } catch {
    return [];
  }
}
