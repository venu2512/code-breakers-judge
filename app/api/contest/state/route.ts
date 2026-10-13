import { getStatus } from "@/lib/contest";
import { getSession } from "@/lib/auth";
import { handler, HttpError, ok } from "@/lib/api";

export const runtime = "nodejs";

/** Polled by the team waiting screen and timer. Server clock is the truth. */
export const GET = handler(async () => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Not logged in");
  return ok(getStatus());
});
