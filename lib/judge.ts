import { db } from "./db";
import { runSubmission } from "./runner";
import { outputsMatch } from "./compare";
import type { JudgeStatus, TestResult } from "./types";
import type { Language } from "./config";

export { normalizeOutput, outputsMatch } from "./compare";

const SEVERITY: JudgeStatus[] = [
  "OK",
  "WRONG_ANSWER",
  "RUNTIME_ERROR",
  "TIME_LIMIT_EXCEEDED",
  "OUTPUT_LIMIT_EXCEEDED",
  "COMPILE_ERROR",
  "INTERNAL_ERROR",
];

function worst(statuses: JudgeStatus[]): JudgeStatus {
  let worstRank = 0;
  let result: JudgeStatus = "OK";
  for (const s of statuses) {
    const rank = SEVERITY.indexOf(s);
    if (rank > worstRank) {
      worstRank = rank;
      result = s;
    }
  }
  return result;
}

export interface JudgeOutcome {
  status: JudgeStatus;
  passed: number;
  total: number;
  results: TestResult[];
  timeMs: number;
}

interface TestRow {
  id: number;
  input: string;
  expected: string;
  is_sample: number;
  ordinal: number;
}

/**
 * Judge a submission against either the sample tests (for "Run") or the
 * hidden tests (for "Submit"). Hidden results never carry input/expected/
 * actual output, so nothing can leak through the API.
 */
export async function judge(
  code: string,
  language: Language,
  problemId: number,
  mode: "sample" | "hidden"
): Promise<JudgeOutcome> {
  const problem = db
    .prepare("SELECT time_limit_ms FROM problems WHERE id = ?")
    .get(problemId) as { time_limit_ms: number } | undefined;
  const timeLimit = problem?.time_limit_ms ?? 2000;

  const tests = db
    .prepare(
      `SELECT id, input, expected, is_sample, ordinal
       FROM test_cases
       WHERE problem_id = ? AND is_sample = ?
       ORDER BY ordinal, id`
    )
    .all(problemId, mode === "sample" ? 1 : 0) as TestRow[];

  if (tests.length === 0) {
    return {
      status: mode === "sample" ? "OK" : "INTERNAL_ERROR",
      passed: 0,
      total: 0,
      results:
        mode === "sample"
          ? []
          : [
              {
                index: 0,
                sample: false,
                status: "INTERNAL_ERROR",
                timeMs: 0,
                message: "No hidden tests configured for this problem",
              },
            ],
      timeMs: 0,
    };
  }

  const results: TestResult[] = [];
  let passed = 0;
  let totalTime = 0;

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const run = await runSubmission({
      language,
      code,
      stdin: t.input,
      timeLimitMs: timeLimit,
    });
    totalTime += run.timeMs;

    let status: JudgeStatus = run.status;
    if (status === "OK" && !outputsMatch(t.expected, run.stdout)) {
      status = "WRONG_ANSWER";
    }
    if (status === "OK") passed += 1;

    const result: TestResult = {
      index: mode === "sample" ? i + 1 : i + 1,
      sample: mode === "sample",
      status,
      timeMs: run.timeMs,
    };

    if (mode === "sample") {
      // Sample tests are allowed to show input, expected and actual output.
      result.input = t.input;
      result.expected = t.expected;
      result.actual = run.stdout;
      if (run.stderr) result.message = run.stderr.slice(0, 2000);
      if (run.message) result.message = run.message;
    } else if (run.message && run.status !== "OK") {
      result.message = run.message;
    }

    results.push(result);

    if (status === "COMPILE_ERROR" || status === "INTERNAL_ERROR") {
      break; // no point running the remaining tests
    }
  }

  return {
    status: worst(results.map((r) => r.status)),
    passed,
    total: tests.length,
    results,
    timeMs: totalTime,
  };
}
