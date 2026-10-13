import { db } from "@/lib/db";
import { getStatus } from "@/lib/contest";
import { judgeQueue } from "@/lib/queue";
import { handler, ok } from "@/lib/api";

export const runtime = "nodejs";

/** Lightweight liveness/readiness probe for the operator. */
export const GET = handler(async () => {
  let dbOk = true;
  try {
    db.prepare("SELECT 1").get();
  } catch {
    dbOk = false;
  }
  const status = getStatus();
  return ok({
    ok: dbOk,
    serverTime: Date.now(),
    db: dbOk,
    contest: {
      state: status.state,
      currentRound: status.currentRound,
      totalRounds: status.totalRounds,
      secondsRemaining: status.secondsRemaining,
    },
    queuePending: judgeQueue.pending,
  });
});
