import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { logEvent } from "@/lib/events";
import { handler, HttpError, ok, readJson, requireRole } from "@/lib/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  await requireRole("admin");
  const id = Number((await params).id);
  const body = await readJson<{
    name?: string;
    phone?: string;
    members?: string;
  }>(req);

  const team = db.prepare("SELECT id FROM teams WHERE id = ?").get(id);
  if (!team) throw new HttpError(404, "Team not found");

  const fields: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) throw new HttpError(400, "Name cannot be empty");
    const clash = db
      .prepare("SELECT id FROM teams WHERE name_norm = ? AND id <> ?")
      .get(name.toLowerCase(), id);
    if (clash) throw new HttpError(409, "Another team already has that name");
    fields.push("name = ?", "name_norm = ?");
    values.push(name, name.toLowerCase());
  }
  if (body.phone !== undefined) {
    const phone = body.phone.trim();
    if (!/^\d{6,15}$/.test(phone)) {
      throw new HttpError(400, "Phone number must be 6-15 digits");
    }
    fields.push("phone_hash = ?");
    values.push(hashPassword(phone));
  }
  if (body.members !== undefined) {
    fields.push("members = ?");
    values.push(body.members);
  }
  if (fields.length === 0) throw new HttpError(400, "Nothing to update");

  db.prepare(`UPDATE teams SET ${fields.join(", ")} WHERE id = ?`).run(...values, id);
  logEvent("team-update", id);
  return ok({ updated: true });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  await requireRole("admin");
  const id = Number((await params).id);
  const info = db.prepare("DELETE FROM teams WHERE id = ?").run(id);
  if (info.changes === 0) throw new HttpError(404, "Team not found");
  logEvent("team-delete", id);
  return ok({ deleted: true });
});
