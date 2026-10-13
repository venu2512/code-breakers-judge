import { clientInfo, logEvent } from "@/lib/events";
import { allow } from "@/lib/ratelimit";
import { handler, HttpError, ok, readJson, requireRole } from "@/lib/api";

export const runtime = "nodejs";

/**
 * Lightweight client event log (tab switches, paste attempts). Optional
 * proctoring aid. Visible to the admin only, never to the team.
 */
export const POST = handler(async (req: Request) => {
  const session = await requireRole("team");
  // Do not let a runaway client flood the event table.
  if (!allow(`team-event:${session.teamId}`, 30, 60_000)) {
    return ok({ logged: false });
  }
  const body = await readJson<{ kind?: string; detail?: string }>(req);
  if (typeof body.kind !== "string" || body.kind.length > 40) {
    throw new HttpError(400, "Invalid kind");
  }
  const ci = clientInfo(req);
  logEvent(
    `team:${body.kind}`,
    session.teamId,
    typeof body.detail === "string" ? body.detail.slice(0, 200) : undefined,
    ci.ip,
    ci.ua
  );
  return ok({ logged: true });
});
