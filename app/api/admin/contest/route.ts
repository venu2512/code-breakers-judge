import {
  advanceRound,
  extendContest,
  getStatus,
  pauseContest,
  resetContest,
  resumeContest,
  setAllowedLanguages,
  setDuration,
  setRound,
  setTotalRounds,
  startContest,
  stopContest,
} from "@/lib/contest";
import { assignMissing } from "@/lib/assign";
import { logEvent } from "@/lib/events";
import { handler, HttpError, ok, readJson, requireRole } from "@/lib/api";

export const runtime = "nodejs";

export const GET = handler(async () => {
  await requireRole("admin");
  return ok(getStatus());
});

interface ActionBody {
  action?: string;
  seconds?: number;
  minutes?: number;
  languages?: string[];
  round?: number;
  totalRounds?: number;
  advancingTeamIds?: number[];
}

export const POST = handler(async (req: Request) => {
  await requireRole("admin");
  const body = await readJson<ActionBody>(req);

  switch (body.action) {
    case "start": {
      // Assign any team that does not yet have a problem, then start the clock.
      const assigned = assignMissing();
      const status = startContest();
      logEvent("contest-start", null, `assigned ${assigned} team(s)`);
      return ok({ ...status, assigned });
    }
    case "pause":
      logEvent("contest-pause");
      return ok(pauseContest());
    case "resume":
      logEvent("contest-resume");
      return ok(resumeContest());
    case "stop":
      logEvent("contest-stop");
      return ok(stopContest());
    case "reset":
      logEvent("contest-reset");
      return ok(resetContest());
    case "extend":
      logEvent("contest-extend", null, `${body.seconds}s`);
      return ok(extendContest(Number(body.seconds ?? 0)));
    case "duration":
      logEvent("contest-duration", null, `${body.minutes} min`);
      return ok(setDuration(Number(body.minutes ?? 0) * 60));
    case "languages":
      if (!Array.isArray(body.languages)) {
        throw new HttpError(400, "languages must be an array");
      }
      logEvent("contest-languages", null, body.languages.join(","));
      return ok(setAllowedLanguages(body.languages));
    case "advance-round": {
      const ids = Array.isArray(body.advancingTeamIds)
        ? body.advancingTeamIds.filter((n) => typeof n === "number")
        : [];
      const result = advanceRound(ids);
      logEvent(
        "round-advance",
        null,
        `round ${result.round}: ${result.advanced} advanced, ${result.eliminated} out`
      );
      return ok(result);
    }
    case "set-round":
      logEvent("round-set", null, `${body.round}`);
      return ok(setRound(Number(body.round)));
    case "total-rounds":
      logEvent("round-total", null, `${body.totalRounds}`);
      return ok(setTotalRounds(Number(body.totalRounds)));
    default:
      throw new HttpError(400, "Unknown action");
  }
});
