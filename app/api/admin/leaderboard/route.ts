import { getLeaderboard } from "@/lib/scoring";
import { getStatus } from "@/lib/contest";
import { handler, ok, requireRole } from "@/lib/api";

export const runtime = "nodejs";

export const GET = handler(async (req: Request) => {
  await requireRole("admin");
  const url = new URL(req.url);
  const status = getStatus();
  const requested = Number(url.searchParams.get("round") || 0);
  const round =
    requested >= 1 && requested <= status.totalRounds ? requested : status.currentRound;
  return ok({ rows: getLeaderboard(round), contest: status, round });
});
