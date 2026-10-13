/**
 * Load test. Fires many submissions at once and times how long the queue takes
 * to drain, so you can watch CPU and memory on the server PC.
 *
 *   npm run load -- --teams 40 --submissions 3
 *
 * Requires the server running and the database seeded with enough teams.
 */
export {};

const BASE = process.env.BASE_URL || "http://localhost:3000";

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return Number(process.argv[i + 1]);
  return fallback;
}

const TEAM_COUNT = arg("teams", 20);
const PER_TEAM = arg("submissions", 2);

const SAMPLE_TEAMS = [
  ["Alpha", "9000000001"],
  ["Bravo", "9000000002"],
  ["Charlie", "9000000003"],
  ["Delta", "9000000004"],
];

async function login(name: string, phone: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/team/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, phone }),
  });
  if (!res.ok) return null;
  const setCookie = res.headers.get("set-cookie");
  return setCookie ? setCookie.split(";")[0] : null;
}

const SOLUTIONS: Record<string, string> = {
  python: "import sys\nprint(5)\n",
  javascript: "console.log(5)\n",
  c: "#include <stdio.h>\nint main(){printf(\"5\\n\");return 0;}\n",
  cpp: "#include <bits/stdc++.h>\nusing namespace std;\nint main(){cout<<5<<\"\\n\";}\n",
  java: 'public class Main{public static void main(String[] a){System.out.println(5);}}\n',
};

async function submit(cookie: string, lang: string) {
  const res = await fetch(`${BASE}/api/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ language: lang, code: SOLUTIONS[lang] }),
  });
  return res.status;
}

async function main() {
  const langs = Object.keys(SOLUTIONS);
  const cookies: string[] = [];
  for (let i = 0; i < TEAM_COUNT; i++) {
    const [name, phone] = SAMPLE_TEAMS[i % SAMPLE_TEAMS.length];
    // If we run out of real seeded teams, stop (login fails).
    const cookie = await login(name, phone);
    if (!cookie) break;
    cookies.push(cookie);
  }

  if (cookies.length === 0) {
    console.error("No teams could log in. Seed more teams or check the server.");
    process.exit(1);
  }

  console.log(
    `Firing ${cookies.length} teams x ${PER_TEAM} submissions (${cookies.length * PER_TEAM} total)...`
  );
  const started = Date.now();
  const jobs: Promise<number>[] = [];
  for (let round = 0; round < PER_TEAM; round++) {
    for (let i = 0; i < cookies.length; i++) {
      jobs.push(submit(cookies[i], langs[i % langs.length]));
    }
  }
  const statuses = await Promise.all(jobs);
  const accepted = statuses.filter((s) => s === 200).length;
  const throttled = statuses.filter((s) => s === 429).length;
  console.log(
    `Accepted: ${accepted}, throttled (cooldown): ${throttled}, wall time: ${
      Date.now() - started
    } ms`
  );
  console.log(
    "Watch the admin Live monitor and the server PC CPU/memory while judging drains."
  );
}

main();
