import type { Language } from "./languages";

export type ContestState = "waiting" | "running" | "paused" | "ended";

export type JudgeStatus =
  | "PENDING"
  | "JUDGING"
  | "OK"
  | "COMPILE_ERROR"
  | "RUNTIME_ERROR"
  | "TIME_LIMIT_EXCEEDED"
  | "OUTPUT_LIMIT_EXCEEDED"
  | "WRONG_ANSWER"
  | "INTERNAL_ERROR";

export interface Team {
  id: number;
  name: string;
  members: string | null;
  created_at: number;
}

export interface Problem {
  id: number;
  code: string;
  title: string;
  statement: string;
  pattern: string | null;
  time_limit_ms: number;
  created_at: number;
}

export interface TestCase {
  id: number;
  problem_id: number;
  input: string;
  expected: string;
  is_sample: number;
  ordinal: number;
}

export interface Submission {
  id: number;
  team_id: number;
  problem_id: number;
  language: Language;
  code: string;
  status: JudgeStatus;
  passed: number;
  total: number;
  results: string; // JSON: TestResult[]
  is_best: number;
  created_at: number;
  judged_at: number | null;
}

export interface TestResult {
  index: number;
  sample: boolean;
  status: JudgeStatus;
  timeMs: number;
  // Only populated for sample (run) tests, never for hidden tests.
  actual?: string;
  expected?: string;
  input?: string;
  message?: string;
}

// ---- API response types (what the browser sees) ----

export interface TeamSession {
  teamId: number;
  name: string;
}

export interface PublicTestPair {
  input: string;
  expected: string;
}

// This is the ONLY problem shape a team may ever receive.
export interface TeamProblemView {
  title: string;
  statement: string;
  patterns: string[];
  samples: PublicTestPair[];
  language: Language | null;
  assigned: boolean;
}

export interface ContestStatusView {
  state: ContestState;
  serverTime: number;
  secondsRemaining: number;
  durationSeconds: number;
  allowedLanguages: Language[];
  startedAt: number | null;
  lockdown?: boolean;
  /** 1-based round currently being run. */
  currentRound: number;
  /** Total number of planned rounds. */
  totalRounds: number;
}
