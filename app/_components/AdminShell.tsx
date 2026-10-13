"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "../_lib/useSession";
import { apiPost } from "../_lib/api";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/problems", label: "Problems" },
  { href: "/admin/assignments", label: "Assignments" },
  { href: "/admin/submissions", label: "Submissions" },
  { href: "/admin/leaderboard", label: "Leaderboard" },
];

export default function AdminShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const session = useSession("admin");
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await apiPost("/api/admin/logout").catch(() => {});
    router.replace("/admin/login");
  }

  if (session === undefined) {
    return (
      <div className="wrap">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (!session || session.role !== "admin") return null;

  return (
    <div className="wrap wrap-wide">
      <div className="row spread" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Code Breakers · Admin</h1>
        <div className="row">
          <span className="muted small">signed in as {session.username}</span>
          <button className="sm ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </div>

      <nav className="nav">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={pathname === l.href ? "active" : ""}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      {title && <h2>{title}</h2>}
      {children}
    </div>
  );
}
