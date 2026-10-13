import { getLeaderboard } from "@/lib/scoring";
import { getStatus } from "@/lib/contest";
import { handler, requireRole } from "@/lib/api";

export const runtime = "nodejs";

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const GET = handler(async (req: Request) => {
  await requireRole("admin");
  const url = new URL(req.url);
  const status = getStatus();
  const requested = Number(url.searchParams.get("round") || 0);
  const round =
    requested >= 1 && requested <= status.totalRounds ? requested : status.currentRound;
  const rows = getLeaderboard(round);

  const header = [
    "rank",
    "team",
    "members",
    "problem",
    "tests_passed",
    "tests_total",
    "time_from_start_seconds",
    "attempts",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.rank,
        r.name,
        r.members ?? "",
        r.problemTitle ?? "",
        r.passed,
        r.total,
        r.elapsedSeconds ?? "",
        r.attempts,
      ]
        .map(csvCell)
        .join(",")
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const body = `# Code Breakers results\n# exported_at,${new Date().toISOString()}\n# round,${round}\n# contest_state,${status.state}\n${lines.join(
    "\n"
  )}\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="code-breakers-round-${round}-${stamp}.csv"`,
    },
  });
});
