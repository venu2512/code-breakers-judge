"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "./api";

export type Session =
  | { role: "team"; teamId: number; name: string }
  | { role: "admin"; username: string }
  | null;

/**
 * Load the current session. When `role` is given, redirect to the matching
 * login page if the visitor is not logged in with that role.
 */
export function useSession(role?: "team" | "admin") {
  const [session, setSession] = useState<Session | undefined>(undefined);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    apiGet<{ session: Session }>("/api/session")
      .then(({ session }) => {
        if (cancelled) return;
        if (role && (!session || session.role !== role)) {
          router.replace(role === "admin" ? "/admin/login" : "/login");
          return;
        }
        setSession(session);
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      });
    return () => {
      cancelled = true;
    };
  }, [role, router]);

  return session;
}
