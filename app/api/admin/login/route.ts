import { config } from "@/lib/config";
import { handler, HttpError, ok, readJson } from "@/lib/api";
import { setSessionCookie } from "@/lib/auth";
import { allow, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

export const POST = handler(async (req: Request) => {
  if (!allow(`admin-login:${clientIp(req)}`)) {
    throw new HttpError(429, "Too many login attempts. Wait a minute.");
  }
  const { username, password } = await readJson<{
    username?: string;
    password?: string;
  }>(req);

  if (
    (username ?? "") !== config.adminUsername ||
    (password ?? "") !== config.adminPassword
  ) {
    throw new HttpError(401, "Wrong admin credentials");
  }

  await setSessionCookie({ role: "admin", username: config.adminUsername });
  return ok({ username: config.adminUsername });
});
