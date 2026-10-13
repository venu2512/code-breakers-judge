import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareScore,
  rankScores,
  assignRoundRobin,
  shuffle,
  type ScoreInput,
} from "../lib/rank";

test("more tests passed ranks ahead regardless of time", () => {
  const a: ScoreInput = { teamId: 1, passed: 3, bestTimeMs: 9000, attempts: 1 };
  const b: ScoreInput = { teamId: 2, passed: 5, bestTimeMs: 1000, attempts: 1 };
  assert.ok(compareScore(b, a) < 0, "b with 5 passes should rank first");
  assert.ok(compareScore(a, b) > 0);
});

test("earlier submission breaks a tie", () => {
  const early: ScoreInput = { teamId: 1, passed: 4, bestTimeMs: 1000, attempts: 2 };
  const late: ScoreInput = { teamId: 2, passed: 4, bestTimeMs: 5000, attempts: 1 };
  assert.ok(compareScore(early, late) < 0);
});

test("teams with no submission rank behind teams that submitted", () => {
  const none: ScoreInput = { teamId: 1, passed: 0, bestTimeMs: null, attempts: 0 };
  const some: ScoreInput = { teamId: 2, passed: 0, bestTimeMs: 2000, attempts: 1 };
  assert.ok(compareScore(some, none) < 0);
});

test("rankScores assigns sequential ranks and keeps stable ties", () => {
  const rows: ScoreInput[] = [
    { teamId: 1, passed: 2, bestTimeMs: 100, attempts: 1 },
    { teamId: 2, passed: 5, bestTimeMs: 900, attempts: 1 },
    { teamId: 3, passed: 2, bestTimeMs: 50, attempts: 1 },
    { teamId: 4, passed: 0, bestTimeMs: null, attempts: 0 },
  ];
  const ranked = rankScores(rows);
  assert.deepEqual(
    ranked.map((r) => r.teamId),
    [2, 3, 1, 4]
  );
  assert.deepEqual(
    ranked.map((r) => r.rank),
    [1, 2, 3, 4]
  );
});

test("round-robin assignment uses every problem about equally", () => {
  const teams = Array.from({ length: 10 }, (_, i) => i + 1);
  const problems = [100, 200, 300];
  const map = assignRoundRobin(teams, problems, mulberry32(42));
  assert.equal(map.size, 10);
  const counts = new Map<number, number>();
  for (const p of map.values()) counts.set(p, (counts.get(p) ?? 0) + 1);
  assert.equal(counts.size, 3);
  // 10 teams over 3 problems: counts differ by at most 1.
  const values = [...counts.values()];
  assert.ok(Math.max(...values) - Math.min(...values) <= 1);
});

test("every team gets exactly one problem", () => {
  const map = assignRoundRobin([1, 2, 3], [10], mulberry32(1));
  assert.equal(map.get(1), 10);
  assert.equal(map.get(2), 10);
  assert.equal(map.get(3), 10);
});

test("shuffle is deterministic for a fixed RNG and keeps all items", () => {
  const out = shuffle([1, 2, 3, 4, 5], mulberry32(7));
  assert.equal(out.length, 5);
  assert.deepEqual([...out].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

// Small seeded PRNG so tests never flake.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
