import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { config } from "./config";
import { ensureConfig } from "./bootstrap";

ensureConfig();

export const SESSION_COOKIE = "cb_session";
const TEAM_TTL = "12h";
const ADMIN_TTL = "8h";

export type Session =
  | { role: "team"; teamId: number; name: string }
  | { role: "admin"; username: string };

const secretKey = new TextEncoder().encode(config.jwtSecret);

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}

export async function createToken(session: Session): Promise<string> {
  const ttl = session.role === "admin" ? ADMIN_TTL : TEAM_TTL;
  return new SignJWT(session as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secretKey);
}

export async function verifyToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (payload.role === "team" && typeof payload.teamId === "number") {
      return { role: "team", teamId: payload.teamId, name: String(payload.name) };
    }
    if (payload.role === "admin") {
      return { role: "admin", username: String(payload.username) };
    }
    return null;
  } catch {
    return null;
  }
}

/** Read the current session from the httpOnly cookie. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** Set the session cookie. Call from a Route Handler or Server Action. */
export async function setSessionCookie(session: Session): Promise<void> {
  const token = await createToken(session);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // lab runs on plain http:// over LAN
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
