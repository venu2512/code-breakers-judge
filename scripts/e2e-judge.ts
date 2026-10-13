/**
 * End-to-end judge test against a live server.
 *
 *   npm run e2e
 *
 * Logs in as a team, submits a correct solution for whatever problem it was
 * assigned, then waits and checks the admin leaderboard shows a full score.
 */
export {};

const BASE = process.env.BASE_URL || "http://localhost:3000";
const TEAM_NAME = process.env.TEST_TEAM_NAME || "Alpha";
const TEAM_PHONE = process.env.TEST_TEAM_PHONE || "9000000001";

const SOLUTIONS: Record<string, string> = {
  "Sum of Two Numbers": `import sys
a, b = map(int, sys.stdin.read().split())
print(a + b)
`,
  "Maximum of a List": `import sys
data = sys.stdin.read().split()
n = int(data[0])
vals = list(map(int, data[1:1+n]))
print(max(vals))
`,
  "Reverse the Words": `import sys
line = sys.stdin.read().split()
print(" ".join(reversed(line)))
`,
};

let cookie: string | null = null;
let adminCookie: string | null = null;

async function call(
  path: string,
  method = "GET",
  body?: unknown,
  asAdmin = false
): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie || adminCookie
        ? { Cookie: (asAdmin ? adminCookie : cookie) ?? "" }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    if (asAdmin) adminCookie = setCookie.split(";")[0];
    else cookie = setCookie.split(";")[0];
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, json };
}

async function main() {
  const alogin = await call(
    "/api/admin/login",
    "POST",
    {
      username: process.env.ADMIN_USERNAME || "admin",
      password: process.env.ADMIN_PASSWORD || "codebreakers",
    },
    true
  );
  if (alogin.status !== 200) throw new Error("admin login failed");

  const contest = await call("/api/admin/contest", "GET", undefined, true);
  if (contest.json?.state === "waiting") {
    await call("/api/admin/contest", "POST", { action: "start" }, true);
    console.log("started the contest (it was waiting)");
  }

  const tlogin = await call("/api/team/login", "POST", {
    name: TEAM_NAME,
    phone: TEAM_PHONE,
  });
  if (tlogin.status !== 200) throw new Error("team login failed");
  console.log(`logged in as ${TEAM_NAME}`);

  const problem = await call("/api/team/problem");
  const title = problem.json?.problem?.title;
  console.log(`assigned problem: ${title}`);

  const code = SOLUTIONS[title];
  if (!code) {
    console.error(`No reference solution for "${title}" in this script.`);
    process.exit(1);
  }

  // Respect the submit cooldown.
  let submitted = false;
  for (let i = 0; i < 5 && !submitted; i++) {
    const res = await call("/api/submit", "POST", { language: "python", code });
    if (res.status === 200) submitted = true;
    else {
      console.log(`submit status ${res.status}, waiting for cooldown...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (!submitted) throw new Error("could not submit");

  console.log("submitted; waiting for the judge...");
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const lb = await call("/api/admin/leaderboard", "GET", undefined, true);
    const row = (lb.json?.rows ?? []).find((r: any) => r.name === TEAM_NAME);
    if (row && row.attempts > 0 && row.total > 0) {
      console.log(
        `leaderboard: ${row.name} rank #${row.rank} score ${row.passed}/${row.total} in ${row.elapsedSeconds}s`
      );
      if (row.passed === row.total) {
        console.log("\nE2E PASS: full score on hidden tests\n");
        process.exit(0);
      } else {
        console.log("\nE2E FAIL: not all hidden tests passed\n");
        process.exit(1);
      }
    }
  }
  console.error("judge never produced a result in time");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
