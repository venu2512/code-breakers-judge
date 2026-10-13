/**
 * Pure ranking and tie-break logic. No database, no I/O: easy to unit test.
 *
 * Rules:
 *  - Score = most hidden tests passed.
 *  - Tie-break = earliest submission time (smaller is better).
 *  - Teams with no submission sort last.
 */

export interface ScoreInput {
  teamId: number;
  passed: number;
  /** created_at (epoch ms) of the team's best submission, or null if none. */
  bestTimeMs: number | null;
  attempts: number;
}

export interface RankedScore extends ScoreInput {
  rank: number;
}

/** Returns <0 if a ranks ahead of b, >0 if behind, 0 if exactly tied. */
export function compareScore(a: ScoreInput, b: ScoreInput): number {
  if (a.passed !== b.passed) return b.passed - a.passed; // more passed first
  const at = a.bestTimeMs;
  const bt = b.bestTimeMs;
  if (at == null && bt == null) return a.teamId - b.teamId;
  if (at == null) return 1; // no submission ranks behind
  if (bt == null) return -1;
  if (at !== bt) return at - bt; // earlier first
  return a.teamId - b.teamId; // stable
}

export function rankScores(rows: ScoreInput[]): RankedScore[] {
  const sorted = [...rows].sort(compareScore);
  return sorted.map((row, i) => ({ ...row, rank: i + 1 }));
}

/** Deterministic Fisher-Yates shuffle using an injected RNG (for tests). */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Assign problems round-robin over shuffled teams so every problem is used
 * about equally. Returns a map of teamId -> problemId.
 */
export function assignRoundRobin(
  teamIds: number[],
  problemIds: number[],
  rng: () => number = Math.random
): Map<number, number> {
  if (problemIds.length === 0) throw new Error("No problems to assign");
  const teams = shuffle(teamIds, rng);
  const problems = shuffle(problemIds, rng);
  const result = new Map<number, number>();
  teams.forEach((team, i) => {
    result.set(team, problems[i % problems.length]);
  });
  return result;
}
