import { db } from "./db";
import { HttpError } from "./api";
import { parseAllowedLanguages } from "./config";
import type { ContestState, ContestStatusView } from "./types";

interface ContestRow {
  id: number;
  state: ContestState;
  duration_seconds: number;
  started_at: number | null;
  ends_at: number | null;
  remaining_seconds: number | null;
  allowed_languages: string;
  current_round: number;
  total_rounds: number;
  updated_at: number;
  lockdown: number;
}

export interface RoundTiming {
  round_no: number;
  started_at: number | null;
  ends_at: number | null;
}

function now(): number {
  return Date.now();
}

function read(): ContestRow {
  const row = db
    .prepare("SELECT * FROM contest WHERE id = 1")
    .get() as ContestRow;
  return row;
}

function write(patch: Partial<ContestRow>): void {
  const current = read();
  const next = { ...current, ...patch, updated_at: now() };
  db.prepare(
    `UPDATE contest SET
       state = @state,
       duration_seconds = @duration_seconds,
       started_at = @started_at,
       ends_at = @ends_at,
       remaining_seconds = @remaining_seconds,
       allowed_languages = @allowed_languages,
       current_round = @current_round,
       total_rounds = @total_rounds,
       lockdown = @lockdown,
       updated_at = @updated_at
     WHERE id = 1`
  ).run(next);
}

/** The current 1-based round number. */
export function currentRound(): number {
  return read().current_round;
}

/** When a round started (for elapsed-time display on past rounds). */
export function roundTiming(roundNo: number): RoundTiming | undefined {
  return db
    .prepare("SELECT round_no, started_at, ends_at FROM rounds WHERE round_no = ?")
    .get(roundNo) as RoundTiming | undefined;
}

function markRoundStarted(roundNo: number, at: number): void {
  db.prepare(
    `INSERT INTO rounds (round_no, started_at, ends_at, updated_at)
     VALUES (?, ?, NULL, ?)
     ON CONFLICT(round_no) DO UPDATE SET
       started_at = COALESCE(rounds.started_at, excluded.started_at),
       updated_at = excluded.updated_at`
  ).run(roundNo, at, at);
}

function markRoundEnded(roundNo: number, at: number): void {
  db.prepare(
    `INSERT INTO rounds (round_no, started_at, ends_at, updated_at)
     VALUES (?, NULL, ?, ?)
     ON CONFLICT(round_no) DO UPDATE SET
       ends_at = excluded.ends_at,
       updated_at = excluded.updated_at`
  ).run(roundNo, at, at);
}

/**
 * Compute the live status. The server clock is the single source of truth.
 * If a running contest has passed its end time we persist the 'ended' state.
 */
export function getStatus(): ContestStatusView {
  const row = read();
  const nowMs = now();
  let state = row.state;
  let secondsRemaining = 0;

  if (state === "running" && row.ends_at != null) {
    const left = row.ends_at - nowMs;
    if (left <= 0) {
      state = "ended";
      write({ state: "ended", ends_at: nowMs });
      markRoundEnded(row.current_round, nowMs);
    } else {
      secondsRemaining = Math.ceil(left / 1000);
    }
  } else if (state === "paused" && row.remaining_seconds != null) {
    secondsRemaining = Math.ceil(row.remaining_seconds / 1000);
  } else if (state === "waiting") {
    secondsRemaining = row.duration_seconds;
  }

  return {
    state,
    serverTime: nowMs,
    secondsRemaining,
    durationSeconds: row.duration_seconds,
    allowedLanguages: parseAllowedLanguages(row.allowed_languages),
    startedAt: row.started_at,
    lockdown: row.lockdown === 1,
    currentRound: row.current_round,
    totalRounds: row.total_rounds,
  };
}

/** True when a submission/run is allowed right now. */
export function isContestOpen(): boolean {
  const s = getStatus();
  return s.state === "running" && s.secondsRemaining > 0;
}

export function startContest(): ContestStatusView {
  const row = read();
  if (row.state === "running") throw new HttpError(409, "Contest already running");
  const t = now();
  write({
    state: "running",
    started_at: t,
    ends_at: t + row.duration_seconds * 1000,
    remaining_seconds: null,
    lockdown: 1,
  });
  markRoundStarted(row.current_round, t);
  return getStatus();
}

export function pauseContest(): ContestStatusView {
  const row = read();
  if (row.state !== "running") throw new HttpError(409, "Contest is not running");
  const remaining = Math.max(0, (row.ends_at ?? now()) - now());
  write({ state: "paused", remaining_seconds: remaining, ends_at: null, lockdown: 0 });
  return getStatus();
}

export function resumeContest(): ContestStatusView {
  const row = read();
  if (row.state !== "paused") throw new HttpError(409, "Contest is not paused");
  const remaining = row.remaining_seconds ?? row.duration_seconds * 1000;
  write({ state: "running", ends_at: now() + remaining, remaining_seconds: null, lockdown: 1 });
  return getStatus();
}

export function stopContest(): ContestStatusView {
  const row = read();
  const t = now();
  write({ state: "ended", ends_at: t, remaining_seconds: 0, lockdown: 0 });
  markRoundEnded(row.current_round, t);
  return getStatus();
}

export function resetContest(): ContestStatusView {
  const row = read();
  const tx = db.transaction(() => {
    write({
      state: "waiting",
      started_at: null,
      ends_at: null,
      remaining_seconds: null,
      duration_seconds: row.duration_seconds,
      current_round: 1,
      lockdown: 0,
    });
    // Bring every team back in and forget this run's round timings and results.
    db.prepare("UPDATE teams SET eligible_round = 99").run();
    db.prepare("DELETE FROM rounds").run();
    // Submissions are one-shot per round, so a reset must clear them too —
    // otherwise a team that submitted during rehearsal could never submit
    // again after the admin resets for the real run.
    db.prepare("DELETE FROM submissions").run();
  });
  tx();
  return getStatus();
}

export function setDuration(seconds: number): ContestStatusView {
  if (!Number.isFinite(seconds) || seconds < 60 || seconds > 8 * 3600) {
    throw new HttpError(400, "Duration must be between 1 minute and 8 hours");
  }
  const row = read();
  const patch: Partial<ContestRow> = { duration_seconds: Math.floor(seconds) };
  if (row.state === "running" && row.started_at != null) {
    patch.ends_at = row.started_at + Math.floor(seconds) * 1000;
  }
  if (row.state === "paused") {
    patch.remaining_seconds = Math.min(
      row.remaining_seconds ?? seconds * 1000,
      Math.floor(seconds) * 1000
    );
  }
  write(patch);
  return getStatus();
}

/** Extend the running/paused contest by the given number of seconds. */
export function extendContest(seconds: number): ContestStatusView {
  if (!Number.isFinite(seconds) || seconds === 0) {
    throw new HttpError(400, "Extend amount must be a non-zero number of seconds");
  }
  const row = read();
  if (row.state === "running") {
    write({ ends_at: (row.ends_at ?? now()) + Math.floor(seconds) * 1000 });
  } else if (row.state === "paused") {
    write({
      remaining_seconds: (row.remaining_seconds ?? 0) + Math.floor(seconds) * 1000,
    });
  } else {
    throw new HttpError(409, "Can only extend a running or paused contest");
  }
  return getStatus();
}

export function setAllowedLanguages(langs: string[]): ContestStatusView {
  const cleaned = parseAllowedLanguages(langs.join(","));
  write({ allowed_languages: cleaned.join(",") });
  return getStatus();
}

/** Change the number of rounds the event is planned to have. */
export function setTotalRounds(total: number): ContestStatusView {
  const row = read();
  if (!Number.isInteger(total) || total < 1 || total > 10) {
    throw new HttpError(400, "Total rounds must be between 1 and 10");
  }
  write({ total_rounds: total, current_round: Math.min(row.current_round, total) });
  return getStatus();
}

/** Jump to a specific round (recovery tool). Cannot be used mid-round. */
export function setRound(round: number): ContestStatusView {
  const row = read();
  if (row.state === "running") {
    throw new HttpError(409, "Stop the contest before changing the round");
  }
  if (!Number.isInteger(round) || round < 1 || round > row.total_rounds) {
    throw new HttpError(400, `Round must be between 1 and ${row.total_rounds}`);
  }
  write({ current_round: round });
  return getStatus();
}

export interface AdvanceResult extends ContestStatusView {
  /** Teams that stay in for the next round. */
  advanced: number;
  /** Teams that are now out of the contest. */
  eliminated: number;
  /** The round that just became current. */
  round: number;
}

/**
 * Finish the current round, shortlist the teams that advance and move on.
 * Only the teams whose ids are listed stay eligible for the next round; every
 * other team is marked as not qualified. Assignments are cleared so the admin
 * assigns the next round's problems to the surviving teams.
 */
export function advanceRound(advancingTeamIds: number[]): AdvanceResult {
  const row = read();
  if (row.state === "running") {
    throw new HttpError(409, "Stop the current round before advancing");
  }
  if (row.current_round >= row.total_rounds) {
    throw new HttpError(409, `All ${row.total_rounds} rounds are complete`);
  }

  const nextRound = row.current_round + 1;
  const keep = new Set(advancingTeamIds.filter((id) => Number.isInteger(id)));
  const teams = db.prepare("SELECT id, eligible_round FROM teams").all() as {
    id: number;
    eligible_round: number;
  }[];

  let advanced = 0;
  let eliminated = 0;
  const setEligible = db.prepare("UPDATE teams SET eligible_round = ? WHERE id = ?");

  const tx = db.transaction(() => {
    for (const t of teams) {
      if (t.eligible_round < row.current_round) continue; // already out, no change
      if (keep.has(t.id)) {
        advanced += 1;
      } else {
        setEligible.run(row.current_round, t.id);
        eliminated += 1;
      }
    }
    db.prepare("DELETE FROM assignments").run();
    write({
      state: "waiting",
      started_at: null,
      ends_at: null,
      remaining_seconds: null,
      current_round: nextRound,
      lockdown: 0,
    });
  });
  tx();

  return { ...getStatus(), advanced, eliminated, round: nextRound };
}
