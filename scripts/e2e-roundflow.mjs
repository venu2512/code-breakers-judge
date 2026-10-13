// End-to-end round-flow test against a running production build.
// Start the server on port 3001 first (e.g. `npx next start -H 0.0.0.0 -p 3001`),
// then run from the repo root:  npm run e2e-rounds
// Expects a pristine/seed database — it resets the contest as its first step.
const BASE = process.env.BASE_URL || "http://127.0.0.1:3001";

function makeClient() {
  const jar = new Map();
  return {
    async req(path, opts = {}) {
      const headers = { ...(opts.headers || {}) };
      if (jar.size) headers["cookie"] = Array.from(jar.values()).join("; ");
      if (opts.body !== undefined && !headers["content-type"]) {
        headers["content-type"] = "application/json";
      }
      const res = await fetch(BASE + path, { ...opts, headers });
      const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
      for (const c of setCookies) {
        const [pair] = c.split(";");
        const [name] = pair.split("=");
        jar.delete(name);
        jar.set(name, pair);
      }
      let text = "";
      try { text = await res.text(); } catch {}
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return { status: res.status, json, text };
    },
    get(p) { return this.req(p); },
    post(p, body) { return this.req(p, { method: "POST", body: JSON.stringify(body) }); },
  };
}

let pass = 0;
let fail = 0;
function check(label, cond, extra) {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${extra ? ` :: ${extra}` : ""}`);
  }
}

async function waitFor(fn, label, timeoutMs = 40000, every = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await new Promise((r) => setTimeout(r, every));
  }
  throw new Error(`timeout waiting for ${label}`);
}

const admin = makeClient();
const alpha = makeClient();
const charlie = makeClient();

// 0. health
{
  const r = await admin.get("/api/health");
  check("health returns ok", r.status === 200 && r.json?.ok === true && r.json?.db === true, r.text);
  check("health reports round fields", r.json?.contest && typeof r.json.contest.currentRound === "number", r.text);
}

// 1. admin login + reset
{
  const r = await admin.post("/api/admin/login", {
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
  });
  check("admin login", r.status === 200, r.text);
  const res = await admin.post("/api/admin/contest", { action: "reset" });
  check("admin reset -> waiting round 1", res.status === 200 && res.json.currentRound === 1 && res.json.state === "waiting", res.text);
}

// 2. round 1: assign, start
{
  const a = await admin.post("/api/admin/assignments", { action: "assign-all" });
  check("assign-all round 1 assigns 4 teams", a.status === 200 && a.json.assigned === 4, a.text);
  const s = await admin.post("/api/admin/contest", { action: "start" });
  check("start round 1", s.status === 200 && s.json.state === "running" && s.json.currentRound === 1, s.text);

  // advance while running must be rejected
  const adv = await admin.post("/api/admin/contest", { action: "advance-round", advancingTeamIds: [1] });
  check("advance rejected while running (409)", adv.status === 409, adv.text);
}

// 3. alpha logs in, gets problem, runs, submits
{
  const l = await alpha.post("/api/team/login", { name: "Alpha", phone: "9000000001" });
  check("Alpha login", l.status === 200, l.text);
  const p = await alpha.get("/api/team/problem");
  check("Alpha problem round 1", p.status === 200 && p.json.qualified === true && p.json.assigned === true, p.text);
  const run = await alpha.post("/api/run", {
    language: "python",
    code: "print(sum(map(int, input().split())))",
  });
  check(
    "Alpha run samples round 1 judged (any verdict)",
    run.status === 200 && run.json.results && run.json.results.length === 3,
    run.text
  );
  const sub = await alpha.post("/api/submit", {
    language: "python",
    code: "print(sum(map(int, input().split())))",
  });
  check("Alpha submit round 1 received", sub.status === 200 && sub.json.received === true, sub.text);

  // 3b. one-shot rule locks everything after the first submit
  {
    const p2 = await alpha.get("/api/team/problem");
    check(
      "Alpha problem payload reports submitted + submittedAtMs + roundStartedAtMs",
      p2.status === 200 &&
        p2.json.submitted === true &&
        typeof p2.json.submittedAtMs === "number" &&
        typeof p2.json.roundStartedAtMs === "number",
      p2.text
    );
    const sub2 = await alpha.post("/api/submit", {
      language: "python",
      code: "print(2)",
    });
    check("Alpha second submit blocked (409)", sub2.status === 409, sub2.text);
    const run2 = await alpha.post("/api/run", {
      language: "python",
      code: "print(2)",
    });
    check("Alpha run blocked after submit (409)", run2.status === 409, run2.text);
    const save = await alpha.post("/api/team/code", {
      language: "python",
      code: "print(999)",
    });
    check("Alpha autosave blocked after submit (409)", save.status === 409, save.text);
  }
}

// 4. wait for judging, verify it is attributed to round 1
// (verdict-independent: assignment is a random shuffle, so Alpha may get any
// seeded problem — what matters is that the submission got judged)
{
  await waitFor(async () => {
    const r = await admin.get("/api/admin/leaderboard?round=1");
    const row = r.json?.rows?.find((x) => x.name === "Alpha");
    return row && row.attempts > 0 ? row : null;
  }, "Alpha judged on round-1 leaderboard");
  const lb = await admin.get("/api/admin/leaderboard?round=1");
  const row = lb.json.rows.find((x) => x.name === "Alpha");
  check("round-1 leaderboard has Alpha result", row && row.attempts > 0, JSON.stringify(row));
  const lb2 = await admin.get("/api/admin/leaderboard?round=2");
  check("round-2 leaderboard starts empty", lb2.status === 200 && lb2.json.rows.every((x) => x.passed === 0), lb2.text);

  // Tab switch logs a proctoring event; it must carry the team name.
  await alpha.post("/api/team/event", { kind: "tab-switch", detail: "e2e probe" });
  const m = await admin.get("/api/admin/monitor");
  const ev = m.json?.events?.find(
    (e) => e.kind === "team:tab-switch" && e.detail === "e2e probe"
  );
  check(
    "monitor recent event shows team name",
    m.status === 200 && ev && ev.team_name === "Alpha",
    JSON.stringify(ev)
  );
}

// 5. get team ids, stop round 1, shortlist Alpha+Bravo
{
  const t = await admin.get("/api/admin/teams");
  const byName = new Map(t.json.teams.map((x) => [x.name, x.id]));
  const alphaId = byName.get("Alpha");
  const bravoId = byName.get("Bravo");
  const charlieId = byName.get("Charlie");
  const deltaId = byName.get("Delta");
  const st = await admin.post("/api/admin/contest", { action: "stop" });
  check("stop round 1 -> ended", st.status === 200 && st.json.state === "ended", st.text);
  const adv = await admin.post("/api/admin/contest", {
    action: "advance-round",
    advancingTeamIds: [alphaId, bravoId],
  });
  check(
    "advance to round 2 (2 advanced / 2 eliminated)",
    adv.status === 200 && adv.json.round === 2 && adv.json.advanced === 2 && adv.json.eliminated === 2 && adv.json.state === "waiting",
    adv.text
  );
}

// 6. round 2: eliminated team is blocked but can log in
{
  const l = await charlie.post("/api/team/login", { name: "Charlie", phone: "9000000003" });
  check("Charlie login (eliminated) still works", l.status === 200, l.text);
  const p = await charlie.get("/api/team/problem");
  check("Charlie problem round 2 -> not qualified", p.status === 200 && p.json.qualified === false && p.json.assigned === false && p.json.round === 2, p.text);
  const run = await charlie.post("/api/run", { language: "python", code: "print(1)" });
  check("Charlie run blocked after elimination (403)", run.status === 403, run.text);
  const sub = await charlie.post("/api/submit", { language: "python", code: "print(1)" });
  check("Charlie submit blocked after elimination (403)", sub.status === 403, sub.text);

  const p2 = await alpha.get("/api/team/problem");
  check("Alpha problem round 2 -> qualified, not yet assigned", p2.status === 200 && p2.json.qualified === true && p2.json.assigned === false, p2.text);
}

// 7. assign round 2, alpha runs, round 1 history intact
{
  const a = await admin.post("/api/admin/assignments", { action: "assign-all" });
  check("assign-all round 2 assigns only 2 (eligible)", a.status === 200 && a.json.assigned === 2, a.text);
  const p = await alpha.get("/api/team/problem");
  check("Alpha assigned problem round 2", p.status === 200 && p.json.assigned === true && p.json.round === 2, p.text);
  const st = await admin.post("/api/admin/contest", { action: "start" });
  check("start round 2", st.status === 200 && st.json.state === "running" && st.json.currentRound === 2, st.text);
  // Give Alpha's run cooldown (3s) time to elapse before running again.
  await new Promise((r) => setTimeout(r, 3500));
  const run = await alpha.post("/api/run", { language: "python", code: "print(sum(map(int, input().split())))" });
  check("Alpha run round 2 judged (any verdict)", run.status === 200 && run.json.results && run.json.results.length === 3, run.text);
  const p2 = await alpha.get("/api/team/problem");
  check("Alpha submitted flag cleared for round 2 (fresh one-shot)", p2.status === 200 && p2.json.submitted === false, p2.text);
  const lb1 = await admin.get("/api/admin/leaderboard?round=1");
  const a1 = lb1.json.rows.find((x) => x.name === "Alpha");
  check("round-1 history intact after advance", lb1.status === 200 && a1 && a1.attempts > 0, lb1.text);

  // final shortlist: only Alpha survives to round 3
  const st2 = await admin.post("/api/admin/contest", { action: "stop" });
  check("stop round 2", st2.status === 200, st2.text);
  const t = await admin.get("/api/admin/teams");
  const alphaId = t.json.teams.find((x) => x.name === "Alpha").id;
  const adv = await admin.post("/api/admin/contest", { action: "advance-round", advancingTeamIds: [alphaId] });
  // With the counting fix: 1 advanced, 1 newly eliminated (Bravo); Charlie and
  // Delta were already out from round 1 and are not double-counted.
  check("advance to round 3 (1 advanced / 1 newly eliminated)", adv.status === 200 && adv.json.round === 3 && adv.json.advanced === 1 && adv.json.eliminated === 1, adv.text);
}

// 8. round 3: only Alpha could be assigned
{
  const a = await admin.post("/api/admin/assignments", { action: "assign-all" });
  check("assign-all round 3 assigns only 1", a.status === 200 && a.json.assigned === 1, a.text);
  const s = await admin.post("/api/admin/contest", { action: "start" });
  check("start round 3 (final)", s.status === 200 && s.json.currentRound === 3 && s.json.totalRounds === 3, s.text);
  const p = await alpha.get("/api/team/problem");
  check("Alpha problem round 3 assigned", p.status === 200 && p.json.round === 3 && p.json.assigned === true, p.text);
}

// 9. export endpoint honours round
{
  const e = await admin.get("/api/admin/export?round=2");
  check("export round=2 is CSV", e.status === 200 && e.text.includes("# round,2"), e.text.slice(0, 80));
}

// 10. reset clears the one-shot lock so a fresh run can start over
{
  const res = await admin.post("/api/admin/contest", { action: "reset" });
  check("reset -> waiting round 1", res.status === 200 && res.json.state === "waiting" && res.json.currentRound === 1, res.text);
  await admin.post("/api/admin/assignments", { action: "assign-all" });
  await admin.post("/api/admin/contest", { action: "start" });
  const p = await alpha.get("/api/team/problem");
  check("Alpha submitted flag cleared after reset", p.status === 200 && p.json.submitted === false, p.text);
  // Let the 15s submit cooldown from earlier rounds fully elapse.
  await new Promise((r) => setTimeout(r, 16000));
  const sub = await alpha.post("/api/submit", { language: "python", code: "print(3)" });
  check("Alpha can submit again after reset", sub.status === 200 && sub.json.received === true, sub.text);
  const sub2 = await alpha.post("/api/submit", { language: "python", code: "print(4)" });
  check("one-shot re-locks after fresh submit", sub2.status === 409, sub2.text);
}

console.log(`\nResults: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);