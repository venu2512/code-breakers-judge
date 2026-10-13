import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { logEvent } from "@/lib/events";
import { handler, HttpError, ok, readJson, requireRole } from "@/lib/api";

export const runtime = "nodejs";

export const GET = handler(async () => {
  await requireRole("admin");
  const teams = db
    .prepare(
      `SELECT t.id, t.name, t.members, t.eligible_round, t.created_at,
              p.title AS problem_title, p.id AS problem_id,
              (SELECT COUNT(*) FROM submissions s WHERE s.team_id = t.id) AS submissions,
              (SELECT MAX(s.created_at) FROM submissions s WHERE s.team_id = t.id) AS last_submission
       FROM teams t
       LEFT JOIN assignments a ON a.team_id = t.id
       LEFT JOIN problems p ON p.id = a.problem_id
       ORDER BY t.name COLLATE NOCASE`
    )
    .all();
  return ok({ teams });
});

export const POST = handler(async (req: Request) => {
  await requireRole("admin");
  const body = await readJson<{
    name?: string;
    phone?: string;
    members?: string;
  }>(req);
  const name = (body.name ?? "").trim();
  const phone = (body.phone ?? "").trim();
  if (!name) throw new HttpError(400, "Team name is required");
  if (!/^\d{6,15}$/.test(phone)) {
    throw new HttpError(400, "Phone number must be 6-15 digits");
  }

  const exists = db
    .prepare("SELECT id FROM teams WHERE name_norm = ?")
    .get(name.toLowerCase());
  if (exists) throw new HttpError(409, "A team with that name already exists");

  const info = db
    .prepare(
      `INSERT INTO teams (name, name_norm, phone_hash, members, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(name, name.toLowerCase(), hashPassword(phone), body.members ?? null, Date.now());
  logEvent("team-create", Number(info.lastInsertRowid), name);
  return ok({ id: Number(info.lastInsertRowid), name });
});
