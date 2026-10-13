import { db } from "@/lib/db";
import { judge } from "@/lib/judge";
import { handler, HttpError, ok, readJson, requireRole } from "@/lib/api";
import { ALL_LANGUAGES, type Language } from "@/lib/config";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function isLanguage(v: unknown): v is Language {
  return typeof v === "string" && (ALL_LANGUAGES as string[]).includes(v);
}

/**
 * Validate a problem by running a reference solution against ALL test cases
 * (samples and hidden). Use this before the event to catch bad expected output.
 */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  await requireRole("admin");
  const id = Number((await params).id);
  const problem = db.prepare("SELECT id FROM problems WHERE id = ?").get(id);
  if (!problem) throw new HttpError(404, "Problem not found");

  const body = await readJson<{ language?: string; code?: string }>(req);
  if (!isLanguage(body.language)) throw new HttpError(400, "Unknown language");
  if (typeof body.code !== "string") throw new HttpError(400, "Missing code");

  // Sample pass...
  const samples = await judge(body.code, body.language, id, "sample");
  // ...and hidden pass.
  const hidden = await judge(body.code, body.language, id, "hidden");

  const failures = [
    ...samples.results.filter((r) => r.status !== "OK"),
    ...hidden.results
      .filter((r) => r.status !== "OK")
      .map((r) => ({ ...r, sample: false })),
  ];

  return ok({
    ok: failures.length === 0,
    samplesPassed: samples.passed,
    samplesTotal: samples.total,
    hiddenPassed: hidden.passed,
    hiddenTotal: hidden.total,
    hiddenStatus: hidden.status,
    failures,
  });
});
