"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "../_components/AdminShell";
import { apiGet, apiPost } from "../_lib/api";
import { ALL_LANGUAGES, LANGUAGE_LABELS, type Language } from "@/lib/languages";
import type { ContestStatusView } from "@/lib/types";

interface MonitorTeam {
  id: number;
  name: string;
  eligible_round: number;
  submissions: number;
  last_submission: number | null;
  pending: number;
  in_flight: number;
}
interface MonitorData {
  contest: ContestStatusView;
  round: number;
  teams: MonitorTeam[];
  queuePending: number;
  events: { id: number; at: number; kind: string; team_id: number | null; detail: string | null }[];
  serverNow: number;
}
interface RuntimeTool {
  language: string;
  command: string;
  available: boolean;
  version: string | null;
  error: string | null;
}

export default function AdminDashboard() {
  const [contest, setContest] = useState<ContestStatusView | null>(null);
  const [monitor, setMonitor] = useState<MonitorData | null>(null);
  const [tools, setTools] = useState<RuntimeTool[] | null>(null);
  const [minutes, setMinutes] = useState(45);
  const [langs, setLangs] = useState<Language[]>([]);
  const [totalRounds, setTotalRounds] = useState(3);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [c, m] = await Promise.all([
        apiGet<ContestStatusView>("/api/admin/contest"),
        apiGet<MonitorData>("/api/admin/monitor"),
      ]);
      setContest(c);
      setMonitor(m);
      setLangs(c.allowedLanguages);
      setMinutes(Math.round(c.durationSeconds / 60));
      setTotalRounds(c.totalRounds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await apiPost<ContestStatusView & { assigned?: number }>(
        "/api/admin/contest",
        { action, ...extra }
      );
      setContest(res);
      setMessage(
        action === "start"
          ? `Contest started. Assigned ${res.assigned ?? 0} team(s).`
          : `Done: ${action}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function checkRuntimes() {
    setError("");
    try {
      const { tools } = await apiGet<{ tools: RuntimeTool[] }>("/api/admin/runtimes");
      setTools(tools);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed");
    }
  }

  const state = contest?.state ?? "…";

  return (
    <AdminShell title="Contest control">
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      <div className="card">
        <div className="row spread">
          <div className="row">
            <span className={`badge ${state === "running" ? "ok" : state === "ended" ? "fail" : "warn"}`}>
              {state}
            </span>
            {contest && (
              <span className="badge">
                Round {contest.currentRound}/{contest.totalRounds}
              </span>
            )}
            {contest && (
              <span className="muted">
                {Math.floor(contest.secondsRemaining / 60)}m{" "}
                {contest.secondsRemaining % 60}s remaining ·{" "}
                {Math.round(contest.durationSeconds / 60)}m total
              </span>
            )}
            {monitor && (
              <span className="muted small">queue: {monitor.queuePending}</span>
            )}
          </div>
          <div className="row">
            <button
              className="primary"
              disabled={busy || state === "running"}
              onClick={() => act("start")}
            >
              Start
            </button>
            <button disabled={busy || state !== "running"} onClick={() => act("pause")}>
              Pause
            </button>
            <button disabled={busy || state !== "paused"} onClick={() => act("resume")}>
              Resume
            </button>
            <button className="danger" disabled={busy || state === "ended"} onClick={() => act("stop")}>
              Stop
            </button>
            <button disabled={busy} onClick={() => act("reset")}>
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3>Duration &amp; time</h3>
          <div className="row">
            <div style={{ width: 120 }}>
              <label htmlFor="minutes">Minutes</label>
              <input
                id="minutes"
                type="number"
                min={1}
                max={480}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </div>
            <button
              style={{ marginTop: 20 }}
              disabled={busy}
              onClick={() => act("duration", { minutes })}
            >
              Set duration
            </button>
            <button style={{ marginTop: 20 }} disabled={busy} onClick={() => act("extend", { seconds: 300 })}>
              +5 min
            </button>
            <button style={{ marginTop: 20 }} disabled={busy} onClick={() => act("extend", { seconds: 600 })}>
              +10 min
            </button>
          </div>
          <p className="muted small">
            The server clock is the single source of truth. Extending only works
            while the contest is running or paused.
          </p>
        </div>

        <div className="card">
          <h3>Allowed languages</h3>
          <div className="row">
            {ALL_LANGUAGES.map((l) => (
              <label key={l} className="row small" style={{ gap: 6 }}>
                <input
                  type="checkbox"
                  style={{ width: "auto" }}
                  checked={langs.includes(l)}
                  onChange={(e) =>
                    setLangs((prev) =>
                      e.target.checked ? [...prev, l] : prev.filter((x) => x !== l)
                    )
                  }
                />
                {LANGUAGE_LABELS[l]}
              </label>
            ))}
          </div>
          <button
            style={{ marginTop: 10 }}
            disabled={busy || langs.length === 0}
            onClick={() => act("languages", { languages: langs })}
          >
            Save languages
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Rounds</h3>
        <div className="row">
          <span className="badge">
            Round {contest?.currentRound ?? 1} of {contest?.totalRounds ?? 1}
          </span>
          <div style={{ width: 140 }}>
            <label htmlFor="totalRounds">Total rounds</label>
            <input
              id="totalRounds"
              type="number"
              min={1}
              max={10}
              value={totalRounds}
              onChange={(e) => setTotalRounds(Number(e.target.value))}
            />
          </div>
          <button
            style={{ marginTop: 20 }}
            disabled={busy || totalRounds === contest?.totalRounds}
            onClick={() => act("total-rounds", { totalRounds })}
          >
            Save rounds
          </button>
          <a href="/admin/leaderboard" style={{ marginTop: 24 }}>
            Shortlist on the leaderboard →
          </a>
        </div>
        <p className="muted small">
          When a round ends, open the Leaderboard, tick the teams that advance and
          click “Advance”. The survivors can log in next round; everyone else sees
          “did not qualify”. Assign the new round&apos;s problems before starting it.
        </p>
      </div>

      <div className="card">
        <div className="row spread">
          <h3 style={{ margin: 0 }}>Live monitor</h3>
          <span className="muted small">
            {monitor?.teams.length ?? 0} teams · round {monitor?.round ?? contest?.currentRound ?? 1} ·
            refreshing every 3s
          </span>
        </div>
        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Team</th>
              <th>Round status</th>
              <th>Submissions</th>
              <th>In flight</th>
              <th>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {monitor?.teams.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>
                  {t.eligible_round >= (contest?.currentRound ?? 1) ? (
                    <span className="badge ok">in</span>
                  ) : (
                    <span className="badge fail">out</span>
                  )}
                </td>
                <td>{t.submissions}</td>
                <td>{t.in_flight > 0 ? <span className="badge warn">{t.in_flight}</span> : "—"}</td>
                <td className="muted small">
                  {t.last_submission
                    ? new Date(t.last_submission).toLocaleTimeString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="row spread">
            <h3 style={{ margin: 0 }}>Language runtimes</h3>
            <button className="sm" onClick={checkRuntimes}>
              Check on server
            </button>
          </div>
          {tools ? (
            <table style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Language</th>
                  <th>Available</th>
                  <th>Version</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((t) => (
                  <tr key={t.language}>
                    <td>{LANGUAGE_LABELS[t.language as Language] ?? t.language}</td>
                    <td>
                      <span className={`badge ${t.available ? "ok" : "fail"}`}>
                        {t.available ? "yes" : "no"}
                      </span>
                    </td>
                    <td className="muted small">{t.version ?? t.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted small">
              Verify python, gcc, g++, javac and node are reachable from the
              server process before the event.
            </p>
          )}
        </div>

        <div className="card">
          <h3>Recent events</h3>
          <div style={{ maxHeight: 260, overflow: "auto" }}>
            <table>
              <tbody>
                {monitor?.events.map((e) => (
                  <tr key={e.id}>
                    <td className="muted small">{new Date(e.at).toLocaleTimeString()}</td>
                    <td className="small">{e.kind}</td>
                    <td className="muted small">{e.detail ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
