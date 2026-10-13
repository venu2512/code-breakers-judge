/**
 * Runs once when the Node.js server boots (not during `next build`).
 * Re-enqueues any submission that was left PENDING/JUDGING by a crash or a
 * restart, so a submission is never silently lost mid-contest.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  try {
    const { requeueStuckSubmissions } = await import("./lib/submissions");
    requeueStuckSubmissions();
  } catch (err) {
    console.error("[boot] failed to requeue unfinished submissions:", err);
  }
}
