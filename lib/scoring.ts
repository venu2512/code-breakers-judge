import { db } from "./db";
import { getStatus, roundTiming } from "./contest";
import { rankScores, type ScoreInput, type RankedScore } from "./rank";

/**
 * Recompute which submission is the team's best within one round.
 * Best = most hidden tests passed, earliest time breaks ties.
 */
export function updateBestForTeam(teamId: number, round: number): void {
  db.prepare("UPDATE submissions SET is_best = 0 WHERE team_id = ? AND round = ?").run(
    teamId,
    round
  );
  const best = db
    .prepare(
      `SELECT id FROM submissions
       WHERE team_id = ? AND round = ? AND judged_at IS NOT NULL
       ORDER BY passed DESC, created_at ASC, id ASC
       LIMIT 1`
    )
    .get(teamId, round) as { id: number } | undefined;
  if (best) {
    db.prepare("UPDATE submissions SET is_best = 1 WHERE id = ?").run(best.id);
  }
}

export interface LeaderboardRow extends RankedScore {
  name: string;
  members: string | null;
  problemTitle: string | null;
  passed: number;
  total: number;
  bestTimeMs: number | null;
  /** Seconds from contest start to the best submission (null when none). */
  elapsedSeconds: number | null;
  attempts: number;
}

export function getLeaderboard(round?: number): LeaderboardRow[] {
  const status = getStatus();
  const r = round ?? status.currentRound;

  // Only teams that were eligible for this round appear on its board.
  const teams = db
    .prepare("SELECT id, name, members FROM teams WHERE eligible_round >= ? ORDER BY id")
    .all(r) as { id: number; name: string; members: string | null }[];

  const assignmentRows = db
    .prepare(
      `SELECT a.team_id, p.title AS title, p.id AS problem_id
       FROM assignments a JOIN problems p ON p.id = a.problem_id`
    )
    .all() as { team_id: number; title: string; problem_id: number }[];
  const assignedTitle = new Map(assignmentRows.map((x) => [x.team_id, x.title]));

  const subs = db
    .prepare(
      `SELECT s.team_id, s.passed, s.total, s.created_at, p.title AS problem_title
       FROM submissions s JOIN problems p ON p.id = s.problem_id
       WHERE s.judged_at IS NOT NULL AND s.round = ?`
    )
    .all(r) as {
    team_id: number;
    passed: number;
    total: number;
    created_at: number;
    problem_title: string;
  }[];

  const byTeam = new Map<number, typeof subs>();
  for (const s of subs) {
    const list = byTeam.get(s.team_id) ?? [];
    list.push(s);
    byTeam.set(s.team_id, list);
  }

  const inputs: (ScoreInput & {
    name: string;
    members: string | null;
    problemTitle: string | null;
    total: number;
  })[] = teams.map((t) => {
    const list = byTeam.get(t.id) ?? [];
    let best: (typeof subs)[number] | null = null;
    for (const s of list) {
      if (
        !best ||
        s.passed > best.passed ||
        (s.passed === best.passed && s.created_at < best.created_at)
      ) {
        best = s;
      }
    }
    return {
      teamId: t.id,
      name: t.name,
      members: t.members,
      problemTitle: best?.problem_title ?? assignedTitle.get(t.id) ?? null,
      passed: best?.passed ?? 0,
      total: best?.total ?? 0,
      bestTimeMs: best?.created_at ?? null,
      attempts: list.length,
    };
  });

  // Elapsed time is measured from this round's start, not the current one.
  const timing = roundTiming(r);
  const startedAt =
    timing?.started_at ?? (r === status.currentRound ? status.startedAt : null);

  const ranked = rankScores(inputs);
  return ranked.map((row) => {
    const src = inputs.find((i) => i.teamId === row.teamId)!;
    const elapsed =
      row.bestTimeMs != null && startedAt != null
        ? Math.max(0, Math.round((row.bestTimeMs - startedAt) / 1000))
        : null;
    return {
      ...row,
      name: src.name,
      members: src.members,
      problemTitle: src.problemTitle,
      total: src.total,
      elapsedSeconds: elapsed,
    };
  });
}
