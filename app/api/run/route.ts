import { getTeamAssignment, getTeamEligibility } from "@/lib/assign";
import { getStatus, isContestOpen } from "@/lib/contest";
import { judge } from "@/lib/judge";
import { judgeQueue } from "@/lib/queue";
import { reserveCooldown } from "@/lib/ratelimit";
import { clientInfo, logEvent } from "@/lib/events";
import { handler, HttpError, ok, readJson, requireRole } from "@/lib/api";
import { ALL_LANGUAGES, RUN_COOLDOWN_MS, type Language } from "@/lib/config";

export const runtime = "nodejs";

interface Body {
  language?: string;
  code?: string;
}

function isLanguage(v: unknown): v is Language {
  return typeof v === "string" && (ALL_LANGUAGES as string[]).includes(v);
}

/** Run against the SAMPLE tests only and show output so teams can debug. */
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

  // Guaranteed by the checks above; kept as consts so the narrowing survives
  // into the judgeQueue callback below.
  const language = body.language;
  const code = body.code;

  const allowed = getStatus().allowedLanguages;
  if (!allowed.includes(language)) {
    throw new HttpError(400, "That language is not enabled for this contest");
  }

  const assignment = getTeamAssignment(session.teamId);
  if (!assignment) throw new HttpError(409, "No problem assigned yet");

  // Per-team run cooldown (check + reserve are synchronous, so concurrent
  // requests cannot both slip through). Runs share the bounded judge queue so
  // a team cannot pin the server CPU by mashing "Run".
  const left = reserveCooldown("run", session.teamId, RUN_COOLDOWN_MS);
  if (left > 0) {
    throw new HttpError(429, `Please wait ${Math.ceil(left / 1000)}s before running again`);
  }

  const ci = clientInfo(req);
  logEvent("run", session.teamId, language, ci.ip, ci.ua);

  const outcome = await judgeQueue.add(() =>
    judge(code, language, assignment.problem_id, "sample")
  );

  // Sample results include input/expected/actual. Nothing hidden is returned.
  return ok({
    status: outcome.status,
    passed: outcome.passed,
    total: outcome.total,
    results: outcome.results,
  });
});
