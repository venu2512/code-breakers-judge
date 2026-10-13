"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "../_lib/api";

export default function TeamLogin() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiPost("/api/team/login", { name, phone });
      router.replace("/contest");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <form className="center-card card" onSubmit={submit}>
        <h1>Team Login</h1>
        <p className="muted small">
          Enter your team name and the phone number registered for your team.
        </p>

        <div style={{ marginTop: 14 }}>
          <label htmlFor="team-name">Team name</label>
          <input
            id="team-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            autoFocus
            required
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label htmlFor="team-phone">Phone number</label>
          <input
            id="team-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            required
          />
        </div>

        {error && (
          <p className="error" role="alert" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        <button
          className="primary"
          type="submit"
          disabled={busy}
          style={{ marginTop: 16, width: "100%" }}
        >
          {busy ? "Signing in…" : "Enter contest"}
        </button>

        <p className="muted small" style={{ marginTop: 14 }}>
          Judge? <Link href="/admin/login">Admin login</Link>
        </p>
      </form>
    </div>
  );
}
