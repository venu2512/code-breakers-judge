"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "./_lib/useSession";

export default function Home() {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session === undefined) return;
    if (!session) router.replace("/login");
    else if (session.role === "admin") router.replace("/admin");
    else router.replace("/contest");
  }, [session, router]);

  return (
    <div className="wrap">
      <div className="center-card card">
        <h1>Code Breakers Judge</h1>
        <p className="muted">Loading…</p>
      </div>
    </div>
  );
}
