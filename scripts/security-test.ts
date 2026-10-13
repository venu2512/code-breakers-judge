/**
 * Security & fairness checks. Run against a live server:
 *
 *   1. start the server:   npm run build && npm start
 *   2. run the checks:     npm run security
 *
 * Verifies:
 *   - a team token can never see hidden tests, pass counts or scores
 *   - every admin route returns 403 for a team token
 *   - admin credentials work
 */
export {};

const BASE = process.env.BASE_URL || "http://localhost:3000";
const TEAM_NAME = process.env.TEST_TEAM_NAME || "Alpha";
const TEAM_PHONE = process.env.TEST_TEAM_PHONE || "9000000001";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, extra = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

interface Jar {
  cookie: string | null;
}

async function call(
  jar: Jar,
  path: string,
  method = "GET",
  body?: unknown
): Promise<{ status: number; text: string; json: any }> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(jar.cookie ? { Cookie: jar.cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) jar.cookie = setCookie.split(";")[0];
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, text, json };
}

async function main() {
  const team: Jar = { cookie: null };
  const admin: Jar = { cookie: null };

  console.log("\n== Team login ==");
  const login = await call(team, "/api/team/login", "POST", {
    name: TEAM_NAME,
    phone: TEAM_PHONE,
  });
  check("team can log in", login.status === 200, `status ${login.status}`);
  if (login.status !== 200) {
    console.log("Cannot continue without a team login. Is the server running?");
    process.exit(1);
  }

  console.log("\n== Team must not see hidden data ==");
  const problem = await call(team, "/api/team/problem");
  check("team problem route works", problem.status === 200);
  const problemText = problem.text.toLowerCase();
  check("no 'hidden' field leaked", !problemText.includes('"hidden"'));
  check("no pass count leaked", !problemText.includes('"passed"'));
  check("no score leaked", !problemText.includes('"score"'));
  check("no 'is_sample' field leaked", !problemText.includes("is_sample"));

  // Admin logs in so we can start the contest for the run/submit tests.
  console.log("\n== Admin login ==");
  const adminLogin = await call(admin, "/api/admin/login", "POST", {
    username: process.env.ADMIN_USERNAME || "admin",
    password: process.env.ADMIN_PASSWORD || "codebreakers",
  });
  check("admin can log in", adminLogin.status === 200, `status ${adminLogin.status}`);

  const contest = await call(admin, "/api/admin/contest");
  if (contest.json?.state === "waiting") {
    await call(admin, "/api/admin/contest", "POST", { action: "start" });
  }

  console.log("\n== Run response carries sample data only ==");
  const py = process.env.TEST_SOLUTION || null;
  const run = await call(team, "/api/run", "POST", {
    language: "python",
    code: py || "print(5)\n",
  });
  check("run returns 200", run.status === 200, `status ${run.status}`);
  const results = run.json?.results ?? [];
  check(
    "every run result is a sample",
    Array.isArray(results) && results.every((r: any) => r.sample === true)
  );

  console.log("\n== Submit response reveals nothing ==");
  const sub = await call(team, "/api/submit", "POST", {
    language: "python",
    code: py || "print(5)\n",
  });
  check("submit accepted", sub.status === 200 || sub.status === 429, `status ${sub.status}`);
  const keys = Object.keys(sub.json ?? {});
  check(
    "submit reply has no score fields",
    !keys.some((k) => ["passed", "total", "score", "status", "results"].includes(k)),
    `keys: ${keys.join(",")}`
  );

  console.log("\n== Team token is forbidden on admin routes ==");
  const adminPaths = [
    ["GET", "/api/admin/contest"],
    ["GET", "/api/admin/teams"],
    ["GET", "/api/admin/problems"],
    ["GET", "/api/admin/assignments"],
    ["GET", "/api/admin/submissions"],
    ["GET", "/api/admin/leaderboard"],
    ["GET", "/api/admin/monitor"],
    ["GET", "/api/admin/runtimes"],
    ["GET", "/api/admin/export"],
  ];
  for (const [method, path] of adminPaths) {
    const res = await call(team, path, method as string);
    check(`${method} ${path} -> 403`, res.status === 403, `got ${res.status}`);
  }

  console.log("\n== No session is rejected on team routes ==");
  const anon: Jar = { cookie: null };
  const anonProblem = await call(anon, "/api/team/problem");
  check("anonymous team route -> 401", anonProblem.status === 401, `got ${anonProblem.status}`);
  const anonAdmin = await call(anon, "/api/admin/teams");
  check("anonymous admin route -> 401", anonAdmin.status === 401, `got ${anonAdmin.status}`);

  console.log("\n== Admin can see results ==");
  const lb = await call(admin, "/api/admin/leaderboard");
  check("admin leaderboard works", lb.status === 200, `status ${lb.status}`);

  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
