"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell from "../../_components/AdminShell";
import { apiGet, apiPost } from "../../_lib/api";
import type { ContestStatusView } from "@/lib/types";

interface Row {
  rank: number;
  teamId: number;
  name: string;
  members: string | null;
  problemTitle: string | null;
  passed: number;
  total: number;
  elapsedSeconds: number | null;
  attempts: number;
}

interface LeaderboardResponse {
  rows: Row[];
  contest: ContestStatusView;
  round: number;
}

export default function AdminLeaderboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [contest, setContest] = useState<ContestStatusView | null>(null);
  const [round, setRound] = useState<number | null>(null);
  const [viewRound, setViewRound] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (requested?: number | null) => {
    try {
      const q = requested ? `?round=${requested}` : "";
      const res = await apiGet<LeaderboardResponse>(`/api/admin/leaderboard${q}`);
      setRows(res.rows);
      setContest(res.contest);
      setRound(res.round);
      setViewRound((prev) => prev ?? res.round);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  // Reload whenever the admin picks a different round.
  useEffect(() => {
    load(viewRound);
  }, [load, viewRound]);

  useEffect(() => {
    const id = setInterval(() => load(viewRound), 5000);
    return () => clearInterval(id);
  }, [load, viewRound]);

  const currentRound = contest?.currentRound ?? 1;
  const totalRounds = contest?.totalRounds ?? 1;
  const isCurrentRound = viewRound == null || viewRound === currentRound;
  const canShortlist =
    isCurrentRound && currentRound < totalRounds && contest?.state !== "running";

  const allSelected = useMemo(
    () => rows.length > 0 && rows.every((r) => selected.has(r.teamId)),
    [rows, selected]
  );

  function toggle(teamId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.teamId)));
  }

  async function advance() {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const res = await apiPost<{
        round: number;
        advanced: number;
        eliminated: number;
      }>("/api/admin/contest", {
        action: "advance-round",
        advancingTeamIds: Array.from(selected),
      });
      setMessage(
        `Round ${res.round} ready. ${res.advanced} team(s) advanced, ${res.eliminated} eliminated. Now assign problems for Round ${res.round}.`
      );
      setSelected(new Set());
      setViewRound(res.round);
      await load(res.round);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Advance failed");
    } finally {
      setBusy(false);
    }
  }

  function fmtElapsed(sec: number | null) {
    if (sec == null) return "—";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${String(s).padStart(2, "0")}s`;
  }

  return (
    <AdminShell title="Leaderboard">
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      <div className="card">
        <div className="row spread">
          <div className="row">
            <span className="muted small">
              contest: {contest?.state ?? "…"} · round {currentRound} of {totalRounds} ·
              refreshes every 5s
            </span>
            <label className="small muted" htmlFor="viewRound" style={{ marginLeft: 12 }}>
              Viewing
            </label>
            <select
              id="viewRound"
              value={viewRound ?? currentRound}
              onChange={(e) => setViewRound(Number(e.target.value))}
              style={{ width: 120 }}
            >
              {Array.from({ length: totalRounds }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Round {n}
                  {n === currentRound ? " (current)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <button
              className="sm"
              onClick={() => {
                window.location.href = `/api/admin/export?round=${viewRound ?? currentRound}`;
              }}
            >
              Export CSV
            </button>
          </div>
        </div>
        <p className="muted small">
          Rank = tests passed (desc), then earliest submission time (asc). Each round
          has its own score and leaderboard.
        </p>

        {canShortlist && (
          <div
            className="card"
            style={{ background: "var(--panel-2)", marginTop: 10 }}
          >
            <div className="row spread">
              <div>
                <strong>Shortlist for Round {currentRound + 1}</strong>
                <p className="muted small" style={{ margin: "4px 0 0" }}>
                  Tick the teams that advance. Everyone not ticked can still log in
                  but will be told they did not qualify.
                </p>
              </div>
              <div className="row">
                <button className="sm ghost" onClick={toggleAll} disabled={busy}>
                  {allSelected ? "Clear all" : "Select all"}
                </button>
                <button className="sm primary" onClick={advance} disabled={busy}>
                  {busy
                    ? "Advancing…"
                    : `Advance ${selected.size} to Round ${currentRound + 1}`}
                </button>
              </div>
            </div>
          </div>
        )}
        {isCurrentRound && currentRound < totalRounds && contest?.state === "running" && (
          <p className="muted small">
            Stop the round before shortlisting teams for Round {currentRound + 1}.
          </p>
        )}
        {isCurrentRound && currentRound >= totalRounds && (
          <p className="muted small">This is the final round.</p>
        )}

        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              {canShortlist && (
                <th>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all teams"
                  />
                </th>
              )}
              <th>Rank</th>
              <th>Team</th>
              <th>Members</th>
              <th>Problem</th>
              <th>Score</th>
              <th>Best time</th>
              <th>Attempts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.teamId}>
                {canShortlist && (
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(r.teamId)}
                      onChange={() => toggle(r.teamId)}
                      aria-label={`Advance ${r.name}`}
                    />
                  </td>
                )}
                <td>
                  {r.rank <= 3 && r.passed > 0 ? (
                    <span className="badge ok">#{r.rank}</span>
                  ) : (
                    `#${r.rank}`
                  )}
                </td>
                <td>{r.name}</td>
                <td className="muted small">{r.members ?? "—"}</td>
                <td className="muted small">{r.problemTitle ?? "—"}</td>
                <td>
                  {r.passed}/{r.total}
                </td>
                <td className="muted small">{fmtElapsed(r.elapsedSeconds)}</td>
                <td>{r.attempts}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canShortlist ? 8 : 7} className="muted small">
                  No teams are eligible for this round yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
