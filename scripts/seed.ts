/**
 * Seed the database with a contest row, sample teams and sample problems.
 * Run with:  npm run seed
 * Safe to re-run: existing teams/problems are left alone.
 */
import bcrypt from "bcryptjs";
import { db } from "../lib/db";

const SAMPLE_TEAMS = [
  { name: "Alpha", phone: "9000000001", members: "Asha, Ravi" },
  { name: "Bravo", phone: "9000000002", members: "Neha, Sam" },
  { name: "Charlie", phone: "9000000003", members: "Ishan, Priya" },
  { name: "Delta", phone: "9000000004", members: "Omar, Lily" },
];

interface SeedProblem {
  code: string;
  title: string;
  pattern: string;
  statement: string;
  timeLimitMs?: number;
  samples: { input: string; expected: string }[];
  hidden: { input: string; expected: string }[];
}

const PROBLEMS: SeedProblem[] = [
  {
    code: "A1",
    title: "Sum of Two Numbers",
    pattern: "input-parsing",
    statement: [
      "# Sum of Two Numbers",
      "",
      "Read two integers separated by whitespace and print their sum.",
      "",
      "## Input",
      "Two integers a and b (-1,000,000,000 <= a, b <= 1,000,000,000).",
      "",
      "## Output",
      "A single integer: a + b.",
      "",
      "## Notes",
      "- Trailing spaces on a line are ignored.",
      "- Blank lines at the end of your output are ignored.",
    ].join("\n"),
    samples: [
      { input: "2 3\n", expected: "5" },
      { input: "-4 10\n", expected: "6" },
      { input: "0 0\n", expected: "0" },
    ],
    hidden: [
      { input: "100 200\n", expected: "300" },
      { input: "-1000000000 -1000000000\n", expected: "-2000000000" },
      { input: "1000000000 999999999\n", expected: "1999999999" },
      { input: "7 -7\n", expected: "0" },
      { input: "123456 654321\n", expected: "777777" },
    ],
  },
  {
    code: "A2",
    title: "Maximum of a List",
    pattern: "input-parsing",
    statement: [
      "# Maximum of a List",
      "",
      "The first line contains n, the number of values. The second line contains",
      "n integers. Print the largest value.",
      "",
      "## Input",
      "1 <= n <= 100,000. Each value fits in a 32-bit signed integer.",
      "",
      "## Output",
      "The maximum value.",
    ].join("\n"),
    samples: [
      { input: "5\n1 9 3 4 2\n", expected: "9" },
      { input: "1\n-7\n", expected: "-7" },
      { input: "4\n-5 -2 -9 -3\n", expected: "-2" },
    ],
    hidden: [
      { input: "3\n100000 999999 1\n", expected: "999999" },
      { input: "6\n0 0 0 0 0 0\n", expected: "0" },
      { input: "2\n-2147483648 2147483647\n", expected: "2147483647" },
      { input: "10\n5 4 3 2 1 0 -1 -2 -3 -4\n", expected: "5" },
      { input: "1\n1000000\n", expected: "1000000" },
    ],
  },
  {
    code: "A3",
    title: "Reverse the Words",
    pattern: "strings",
    statement: [
      "# Reverse the Words",
      "",
      "Given a line of space-separated words, print the words in reverse order.",
      "Words keep their original spelling.",
      "",
      "## Input",
      "One line with at most 1000 words separated by single spaces.",
      "",
      "## Output",
      "The words in reverse order, separated by single spaces.",
    ].join("\n"),
    samples: [
      { input: "hello world\n", expected: "world hello" },
      { input: "a\n", expected: "a" },
      { input: "one two three four\n", expected: "four three two one" },
    ],
    hidden: [
      { input: "code breakers judge\n", expected: "judge breakers code" },
      {
        input: "the quick brown fox jumps over the lazy dog\n",
        expected: "dog lazy the over jumps fox brown quick the",
      },
      { input: "  \n", expected: "" },
      { input: "x y\n", expected: "y x" },
      { input: "same same\n", expected: "same same" },
    ],
  },
];

function seedTeams() {
  const insert = db.prepare(
    `INSERT INTO teams (name, name_norm, phone_hash, members, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  let added = 0;
  for (const t of SAMPLE_TEAMS) {
    const exists = db
      .prepare("SELECT id FROM teams WHERE name_norm = ?")
      .get(t.name.toLowerCase());
    if (exists) continue;
    insert.run(
      t.name,
      t.name.toLowerCase(),
      bcrypt.hashSync(t.phone, 10),
      t.members,
      Date.now()
    );
    added += 1;
  }
  return added;
}

function seedProblems() {
  const insertProblem = db.prepare(
    `INSERT INTO problems (code, title, statement, pattern, time_limit_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertTest = db.prepare(
    `INSERT INTO test_cases (problem_id, input, expected, is_sample, ordinal)
     VALUES (?, ?, ?, ?, ?)`
  );
  let added = 0;
  for (const p of PROBLEMS) {
    const exists = db
      .prepare("SELECT id FROM problems WHERE code = ?")
      .get(p.code);
    if (exists) continue;

    const info = insertProblem.run(
      p.code,
      p.title,
      p.statement,
      p.pattern,
      p.timeLimitMs ?? 2000,
      Date.now()
    );
    const problemId = Number(info.lastInsertRowid);
    p.samples.forEach((t, i) =>
      insertTest.run(problemId, t.input, t.expected, 1, i)
    );
    p.hidden.forEach((t, i) =>
      insertTest.run(problemId, t.input, t.expected, 0, i)
    );
    added += 1;
  }
  return added;
}

function main() {
  const teams = seedTeams();
  const problems = seedProblems();
  const contest = db.prepare("SELECT * FROM contest WHERE id = 1").get();
  console.log("Seed complete.");
  console.log(`  teams added:    ${teams}`);
  console.log(`  problems added: ${problems}`);
  console.log(`  contest state:  ${JSON.stringify(contest)}`);
  console.log("\nSample team logins (team name / phone):");
  for (const t of SAMPLE_TEAMS) console.log(`  ${t.name} / ${t.phone}`);
}

main();
