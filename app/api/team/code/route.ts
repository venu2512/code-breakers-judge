import { db } from "@/lib/db";
import { handler, HttpError, ok, readJson, requireRole } from "@/lib/api";
import { ALL_LANGUAGES, type Language } from "@/lib/config";

export const runtime = "nodejs";

function isLanguage(v: unknown): v is Language {
  return typeof v === "string" && (ALL_LANGUAGES as string[]).includes(v);
}

/** Load all autosaved code for the logged-in team. */
export const GET = handler(async () => {
  const session = await requireRole("team");
  const rows = db
    .prepare("SELECT language, code FROM team_code WHERE team_id = ?")
    .all(session.teamId) as { language: Language; code: string }[];
  const code: Partial<Record<Language, string>> = {};
  for (const r of rows) code[r.language] = r.code;
  return ok({ code });
});

/** Save one language's code for the logged-in team. */
export const POST = handler(async (req: Request) => {
  const session = await requireRole("team");
  const body = await readJson<{ language?: string; code?: string }>(req);
  if (!isLanguage(body.language)) throw new HttpError(400, "Unknown language");
  if (typeof body.code !== "string") throw new HttpError(400, "Missing code");

  db.prepare(
    `INSERT INTO team_code (team_id, language, code, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(team_id, language)
     DO UPDATE SET code = excluded.code, updated_at = excluded.updated_at`
  ).run(session.teamId, body.language, body.code, Date.now());

  return ok({ saved: true, at: Date.now() });
});
