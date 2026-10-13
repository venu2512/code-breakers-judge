"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "../../_lib/api";

export default function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiPost("/api/admin/login", { username, password });
      router.replace("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <form className="center-card card" onSubmit={submit}>
        <h1>Admin Login</h1>
        <p className="muted small">
          Credentials come from <span className="mono">.env.local</span> and are
          never stored in the database.
        </p>

        <div style={{ marginTop: 14 }}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}

        <button
          className="primary"
          type="submit"
          disabled={busy}
          style={{ marginTop: 16, width: "100%" }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="muted small" style={{ marginTop: 14 }}>
          Team? <Link href="/login">Team login</Link>
        </p>
      </form>
    </div>
  );
}
