import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { logEvent } from "@/lib/events";
import { handler, HttpError, ok, readJson, requireRole } from "@/lib/api";

export const runtime = "nodejs";

/**
 * Import teams from CSV text. Expected header:
 *   team_name,phone,members
 * Members is optional. Duplicate names are skipped.
 */
export const POST = handler(async (req: Request) => {
  await requireRole("admin");
  const { csv } = await readJson<{ csv?: string }>(req);
  if (!csv || typeof csv !== "string") throw new HttpError(400, "Missing CSV text");

  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) throw new HttpError(400, "CSV is empty");

  const first = lines[0].toLowerCase();
  const start = first.includes("team") && first.includes("phone") ? 1 : 0;

  const insert = db.prepare(
    `INSERT INTO teams (name, name_norm, phone_hash, members, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );

  let added = 0;
  let skipped = 0;
  const errors: string[] = [];

  const tx = db.transaction(() => {
    for (let i = start; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i]);
      const name = (cols[0] ?? "").trim();
      const phone = (cols[1] ?? "").trim();
      const members = (cols[2] ?? "").trim() || null;
      if (!name || !/^\d{6,15}$/.test(phone)) {
        errors.push(`Line ${i + 1}: bad name or phone`);
        skipped += 1;
        continue;
      }
      const exists = db
        .prepare("SELECT id FROM teams WHERE name_norm = ?")
        .get(name.toLowerCase());
      if (exists) {
        skipped += 1;
        continue;
      }
      insert.run(name, name.toLowerCase(), hashPassword(phone), members, Date.now());
      added += 1;
    }
  });
  tx();

  logEvent("team-import", null, `added ${added}, skipped ${skipped}`);
  return ok({ added, skipped, errors });
});

/** Minimal CSV line splitter with double-quote support. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
