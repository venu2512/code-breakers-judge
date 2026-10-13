import { db } from "@/lib/db";
import { getTeamAssignment, getTeamEligibility } from "@/lib/assign";
import { getStatus, isContestOpen } from "@/lib/contest";
import { submit } from "@/lib/submissions";
import { clientInfo, logEvent } from "@/lib/events";
import { reserveCooldown } from "@/lib/ratelimit";
import { handler, HttpError, ok, readJson, requireRole } from "@/lib/api";
import { ALL_LANGUAGES, SUBMIT_COOLDOWN_MS, type Language } from "@/lib/config";

export const runtime = "nodejs";

interface Body {
  language?: string;
  code?: string;
}

function isLanguage(v: unknown): v is Language {
  return typeof v === "string" && (ALL_LANGUAGES as string[]).includes(v);
}

/**
 * Queue a submission for hidden judging. The team only ever learns that the
 * submission was received. No pass counts, scores or test data are returned.
 */
export const POST = handler(async (req: Request) => {
  const session = await requireRole("team");
  const eligibility = getTeamEligibility(session.teamId);
  if (!eligibility.qualified) {
    throw new HttpError(403, `You did not qualify for round ${eligibility.round}`);
  }
  if (!isContestOpen()) {
    throw new HttpError(403, "The contest is not running");
  }

  const body = await readJson<Body>(req);
  if (!isLanguage(body.language)) throw new HttpError(400, "Unknown language");
  if (typeof body.code !== "string" || body.code.length > 200_000) {
    throw new HttpError(400, "Missing or oversized code");
  }

  const allowed = getStatus().allowedLanguages;
  if (!allowed.includes(body.language)) {
    throw new HttpError(400, "That language is not enabled for this contest");
  }

  const assignment = getTeamAssignment(session.teamId);
  if (!assignment) throw new HttpError(409, "No problem assigned yet");

  // Check + reserve the cooldown after validation, with no await in between,
  // so two concurrent submits from the same team cannot both be accepted.
  const left = reserveCooldown("submit", session.teamId, SUBMIT_COOLDOWN_MS);
  if (left > 0) {
    throw new HttpError(429, `Please wait ${Math.ceil(left / 1000)}s before submitting again`);
  }

  // Autosave on submit so the exact submitted code is recoverable.
  db.prepare(
    `INSERT INTO team_code (team_id, language, code, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(team_id, language)
     DO UPDATE SET code = excluded.code, updated_at = excluded.updated_at`
  ).run(session.teamId, body.language, body.code, Date.now());

  const id = submit(session.teamId, assignment.problem_id, body.language, body.code);
  const ci = clientInfo(req);
  logEvent("submit", session.teamId, `#${id} ${body.language}`, ci.ip, ci.ua);

  return ok({ received: true, submissionId: id, at: Date.now() });
});
