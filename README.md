# Code Breakers Judge

An offline contest judge for the Code Breakers lab event. One server PC runs the
whole app (Next.js + SQLite + a local code runner). Other lab PCs only open it in
a browser. No internet, no Docker, no Judge0.

- Each team logs in with **team name** and **phone number**.
- Each team gets **one random problem** (assigned round-robin at contest start).
- Teams write code in the browser (Monaco editor, bundled locally).
- **Run** checks the sample tests and shows the output.
- **Submit** is judged on the hidden tests. The team only learns that the
  submission was received. **Each team submits exactly once per round** — the
  moment they click *Submit* their personal timer freezes and the code locks
  (no editing, running or re-submitting). The shared round countdown keeps
  running for reference.
- Only the **admin** sees scores, per-test results and the leaderboard.
- The event supports **multiple rounds** (default 3, changeable anytime from the
  admin dashboard). Each round has its own problems and its own score. Between
  rounds the admin shortlists which teams advance; the rest can still log in but
  are told they did not qualify and cannot run or submit.

---

## 1. Requirements

### Server PC
- **Windows or Linux** (Linux/WSL is better if you later want hard memory limits).
- **Node.js 20 LTS or newer** (this project was built and tested on Node 24).
- The language runtimes you allow:
  - Python 3 (`python` on PATH)
  - GCC and G++ (`gcc`, `g++`) — MinGW-w64 on Windows
  - JDK 17+ (`javac`, `java`)
  - Node is already installed for the app.

Check from a **fresh** terminal:

```bat
python --version
gcc --version
g++ --version
javac -version
node -v
```

Missing runtimes are shown in the admin **Dashboard → Language runtimes**
panel, and a submission in that language returns a clear compile error instead
of crashing.

### Lab PCs
- Any modern Chrome/Edge/Firefox. No installs needed.

---

## 2. First-time setup (server PC)

```bat
npm install
copy .env.example .env.local
REM  edit .env.local and change ADMIN_PASSWORD and JWT_SECRET
npm run seed
npm run build
```

`.env.local` holds the admin username/password and the JWT secret. It is
**never** stored in the database and must never be placed in a shared folder.

---

## 3. Network test first

Before building anything else, prove the lab PCs can reach the server.

1. Find the server IPv4 address:
   - Windows: `ipconfig`
   - Linux: `ip a`
2. Open the firewall for TCP port 3000:
   ```bat
   netsh advfirewall firewall add rule name="CodeBreakers 3000" dir=in action=allow protocol=TCP localport=3000
   ```
   If the rule seems ignored, set the network profile to **Private**.
3. Start the server:
   ```bat
   start.bat
   ```
4. On two or three lab PCs open `http://SERVER-IP:3000`.
5. Give the server a **static IP** or reserve it in the router. The address must
   not change between the test and the event.

---

## 4. Running it

### Event day
Double-click **`start.bat`** (Windows) or run **`./start.sh`** (Linux). It
installs (first run), builds once, then serves on `0.0.0.0:3000`.

### Development
```bat
npm run dev
```

### Other commands
| Command | What it does |
| --- | --- |
| `npm run seed` | Add sample teams/problems (safe to re-run) |
| `npm run backup` | Snapshot `data/contest.db` into `data/backups/` (safe while running) |
| `npm test` | Unit tests for scoring, ties, assignment, output comparison |
| `npm run smoke` | Runs real programs incl. infinite loop / huge output / crash |
| `npm run security` | Live checks that teams cannot see hidden data |
| `npm run e2e-rounds` | Full multi-round flow (3 rounds, shortlisting, one-shot locks) against a running server on port 3001 |
| `npm run load` | Fire many submissions at once |

---

## 5. Admin walkthrough

1. Log in at `/admin/login`.
2. **Problems** → create the problems for **Round 1**, add 3–5 samples and
   10–15 hidden tests, then **validate** with a reference solution (runs every
   test through the real runner).
3. **Teams** → add teams by hand or import CSV (`team_name,phone,members`).
4. **Assignments** → preview the round-robin split and swap a team's problem if
   needed. Only teams that qualified are assigned.
5. **Dashboard** → check the language runtimes, set duration, choose allowed
   languages, and set the **total rounds** (default 3). The total can be changed
   at any time, even mid-round — the current round never jumps.
6. **Start** the contest. The clock is the server clock and is the single source
   of truth.
7. Watch the **Live monitor** (✓/— marks whether each team already submitted —
   remember, each team gets exactly one submission per round); use
   **Submissions** to inspect code and rejudge, and **Leaderboard** to export CSV.
   The **Recent events** panel shows who did what, with the **team name** on
   every tab-switch/paste event for proctoring.

### Between rounds (shortlisting)

1. **Stop** the round.
2. Open **Leaderboard** and pick the round from the “Viewing” dropdown (defaults
   to the current round).
3. Tick the teams that advance (or “Select all”) and click **Advance N to Round
   M**. Everyone not ticked can still log in but will see “did not qualify”.
4. Set up the **next round's problems**, then **Assignments → Reassign all**
   (only advancing teams are assigned), and **Start** again.
5. Export the CSV for each round you want to keep before starting the next one
   (past rounds stay downloadable afterwards).

Each round keeps its own submissions and leaderboard, so nothing is lost when
you advance.

---

## 6. How judging works

- Each submission is written to a **fresh temp folder**, compiled if needed,
  run with a per-test time limit, a ~100 KB output cap and a memory cap, then
  the folder is deleted. On Linux the address space of C/C++/Python is capped
  with `ulimit -v` and every run also gets a `ulimit -t` CPU backstop; Java
  uses `JAVA_MAX_HEAP_MB` and JavaScript caps the V8 heap. On Windows only
  Java and JavaScript are capped (see `MEMORY_LIMIT_MB` in `.env.local`).
- Interpreted/JVM languages get a time multiplier so they are not failed on
  startup cost.
- Output comparison ignores trailing spaces on each line and blank lines at the
  end. This rule is printed on the problem sheet.
- Both **Run** (sample tests) and **Submit** (hidden tests) go through the same
  bounded judge queue, so at most **3 jobs** run at once and "Run" cannot pin
  the server CPU.
- A team's personal timer starts at the round start and **freezes the moment they
  submit**. The shared countdown keeps running for everyone.
- **One submission per round.** A second submit (or a run, or an edit) after the
  submission is rejected by the server, and the dashboard shows ✓/— so the admin
  can see who already locked in. A *Reset* clears all submissions for a fresh run.
- **Rank** = score descending, then the frozen time from the round start ascending.
- Every run/submit is rejected once the server clock passes the end time.
- The 15s submit / 3s run cooldowns still apply to the first submission.

---

## 7. Security model

- Teams and admin are separate sessions (httpOnly JWT cookie).
- Admin credentials live only in `.env.local`, never in the DB.
- `requireRole()` guards every API route; a team token gets **403** on all admin
  routes.
- Team responses never include hidden tests, pass counts or scores.
- `npm run security` proves the above against a live server.
- Run the server as a **normal (non-admin) user**, in a folder with nothing
  important. Keep the server PC **offline** during the event.
- Disable AI/code-completion extensions on the lab browsers.
- Optional proctoring: set `NEXT_PUBLIC_BLOCK_PASTE=1` in `.env.local` to block
  paste into the editor. Tab switches and paste attempts are always recorded with
  the team name and shown in the admin event log.

---

## 8. Project layout

```
app/                 Next.js pages and API routes
  api/team/*         team login + problem + autosave code
  api/admin/*        admin login + all admin actions
  api/run, api/submit
  admin/*            admin UI
  contest/           team UI
  login/             team login
lib/
  db.ts              SQLite connection + schema
  auth.ts            password hashing + JWT cookies
  api.ts             route wrapper + requireRole
  contest.ts         server-clock contest state machine
  runner.ts          compile + run with limits, temp-folder isolation
  judge.ts           run tests, compare output
  submissions.ts     queue insert + judge
  queue.ts           bounded-concurrency judge queue
  scoring.ts         best submission + leaderboard
  assign.ts          round-robin assignment
  rank.ts            pure ranking/tie-break/shuffle (unit tested)
  compare.ts         output comparison (unit tested)
  templates.ts       starter code per language
scripts/             seed, monaco copy, smoke, security, load test
data/contest.db      the database (back this up before the event)
public/monaco/vs     Monaco served locally (no CDN)
```

---

## 9. Backup & fallback

**Before the event and between rounds:**
- Run `npm run backup` — writes a timestamped snapshot to `data/backups/` and is
  safe to run while the server is live.
- Keep a copy of the whole project on a USB drive.
- Print the problem sheets as a fallback if a PC fails.
- Prepare a spare PC with a copy of the project.

**To restore a backup:** stop the server, then
`copy data\backups\contest-<time>.db data\contest.db` (Windows) or
`cp data/backups/contest-<time>.db data/contest.db` (Linux), and start again.

After the event:
- Export the CSV from each round's leaderboard, archive `data/contest.db`.

**Health check:** `http://SERVER-IP:3000/api/health` returns JSON with the DB
status, contest state and current round — useful to confirm the server is up
from any PC before the event.

---

## 10. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Lab PC cannot open the page | Firewall rule for port 3000, network profile Private, static IP |
| `better-sqlite3` fails to install | Use the prebuilt v13 (Node 22+); otherwise install VS Build Tools (Windows) |
| Editor does not load | Run `npm run monaco` (copies Monaco into `public/`) and rebuild |
| A language always compile-errors | Check **Dashboard → Language runtimes**; add the runtime to PATH |
| Everyone times out | Increase the problem time limit or lower judge concurrency |
| Server asleep mid-event | Disable sleep and plug into power |
| Server restarted mid-round | Submissions left unfinished are re-judged automatically on startup; start the contest again before teams submit |
| Team says “did not qualify” by mistake | Admin **Teams** page shows `eligible_round`; use **Dashboard → Reset** only to fully restart, or `advance-round` again on the leaderboard |
| Editor does not load after a security-headers change | The CSP allows inline scripts + Monaco blob workers; if it still fails, run `npm run dev` and check the console — `npm run build` regenerates `.next` |
