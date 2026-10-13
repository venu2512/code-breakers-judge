import { getSession } from "@/lib/auth";
import { handler, ok } from "@/lib/api";

export const runtime = "nodejs";

export const GET = handler(async () => {
  const session = await getSession();
  if (!session) return ok({ session: null });
  return ok({ session });
});
