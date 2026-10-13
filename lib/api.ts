import { NextResponse } from "next/server";
import { getSession, type Session } from "./auth";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireRole(role: "team"): Promise<Extract<Session, { role: "team" }>>;
export async function requireRole(role: "admin"): Promise<Extract<Session, { role: "admin" }>>;
export async function requireRole(role: "team" | "admin"): Promise<Session> {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Not logged in");
  if (session.role !== role) throw new HttpError(403, "Forbidden");
  return session;
}

/** Wrap a route handler so thrown HttpErrors become clean JSON responses. */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      // Log the real cause server-side but never leak internals to clients.
      console.error("[api] unhandled error:", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

/** Largest request body we will parse. Code payloads cap at 200 KB. */
const MAX_BODY_BYTES = 2_000_000;

/** Read + parse JSON body, rejecting malformed or oversized input. */
export async function readJson<T = Record<string, unknown>>(
  req: Request
): Promise<T> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) {
    throw new HttpError(413, "Request body too large");
  }
  let text: string;
  try {
    text = await req.text();
  } catch {
    throw new HttpError(400, "Unreadable request body");
  }
  if (text.length > MAX_BODY_BYTES) {
    throw new HttpError(413, "Request body too large");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}
