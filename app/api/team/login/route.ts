import { db } from "@/lib/db";
import { handler, HttpError, ok, readJson } from "@/lib/api";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { allow, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

interface Body {
  name?: string;
  phone?: string;
}

export const POST = handler(async (req: Request) => {
  if (!allow(`team-login:${clientIp(req)}`)) {
    throw new HttpError(429, "Too many login attempts. Wait a minute.");
  }
  const { name, phone } = await readJson<Body>(req);
  const cleanName = (name ?? "").trim();
  const cleanPhone = (phone ?? "").trim();
  if (!cleanName || !cleanPhone) {
    throw new HttpError(400, "Team name and phone number are required");
  }

  const team = db
    .prepare(
      "SELECT id, name, phone_hash FROM teams WHERE name_norm = ?"
    )
    .get(cleanName.toLowerCase()) as
    | { id: number; name: string; phone_hash: string }
    | undefined;

  if (!team || !verifyPassword(cleanPhone, team.phone_hash)) {
    // Same message either way so we do not reveal which teams exist.
    throw new HttpError(401, "Wrong team name or phone number");
  }

  await setSessionCookie({ role: "team", teamId: team.id, name: team.name });
  return ok({ teamId: team.id, name: team.name });
});
