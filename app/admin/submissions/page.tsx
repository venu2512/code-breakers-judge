"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "../../_components/AdminShell";
import { apiGet, apiPost } from "../../_lib/api";
import type { TestResult } from "@/lib/types";

interface SubRow {
  id: number;
  team_id: number;
  team_name: string;
  problem_id: number;
  problem_title: string;
  round: number;
  language: string;
  status: string;
  passed: number;
  total: number;
  is_best: number;
  created_at: number;
  judged_at: number | null;
}
interface SubDetail extends SubRow {
  code: string;
  results: TestResult[];
}

export default function AdminSubmissions() {
  const [rows, setRows] = useState<SubRow[]>([]);
  const [detail, setDetail] = useState<SubDetail | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const [roundFilter, setRoundFilter] = useState(0);
  const [totalRounds, setTotalRounds] = useState(1);

  const load = useCallback(async () => {
    try {
      const q = roundFilter ? `?round=${roundFilter}` : "";
      const [{ submissions }, contest] = await Promise.all([
        apiGet<{ submissions: SubRow[] }>(`/api/admin/submissions${q}`),
        apiGet<{ totalRounds: number }>("/api/admin/contest"),
      ]);
      setRows(submissions);
      setTotalRounds(contest.totalRounds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [roundFilter]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  async function open(id: number) {
    setError("");
    try {
      const { submission } = await apiGet<{ submission: SubDetail }>(
        `/api/admin/submissions/${id}`
      );
      setDetail(submission);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load detail");
    }
  }

  async function rejudge(id: number) {
    setError("");
    setMessage("");
    try {
      await apiPost(`/api/admin/submissions/${id}`);
      setMessage(`Submission ${id} queued for rejudge`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejudge failed");
    }
  }

  const filtered = filter
    ? rows.filter(
        (r) =>
          r.team_name.toLowerCase().includes(filter.toLowerCase()) ||
          r.problem_title.toLowerCase().includes(filter.toLowerCase())
      )
    : rows;

  return (
    <AdminShell title="Submissions">
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      <div className="card">
        <div className="row spread">
          <div className="row">
            <input
              style={{ maxWidth: 320 }}
              placeholder="Filter by team or problem…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <select
              value={roundFilter}
              onChange={(e) => setRoundFilter(Number(e.target.value))}
              style={{ width: 140 }}
            >
              <option value={0}>All rounds</option>
              {Array.from({ length: totalRounds }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Round {n}
                </option>
              ))}
            </select>
          </div>
          <button className="sm" onClick={load}>
            Refresh
          </button>
        </div>
        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>R</th>
              <th>Problem</th>
              <th>Lang</th>
              <th>Status</th>
              <th>Score</th>
              <th>Time</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="mono small">
                  {r.id} {r.is_best ? <span className="badge info">best</span> : null}
                </td>
                <td>{r.team_name}</td>
                <td className="muted small">{r.round}</td>
                <td className="muted small">{r.problem_title}</td>
                <td className="small">{r.language}</td>
                <td>
                  <span className={`badge ${statusClass(r.status)}`}>{r.status}</span>
                </td>
                <td>
                  {r.passed}/{r.total}
                </td>
                <td className="muted small">
                  {new Date(r.created_at).toLocaleTimeString()}
                </td>
                <td className="row">
                  <button className="sm" onClick={() => open(r.id)}>
                    View
                  </button>
                  <button className="sm" onClick={() => rejudge(r.id)}>
                    Rejudge
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="card">
          <div className="row spread">
            <h3 style={{ margin: 0 }}>
              Submission #{detail.id} · {detail.team_name}
            </h3>
            <button className="sm" onClick={() => setDetail(null)}>
              Close
            </button>
          </div>
          <p className="muted small">
            {detail.problem_title} · {detail.language} ·{" "}
            {new Date(detail.created_at).toLocaleString()}
          </p>
          <h4>Code</h4>
          <pre className="out" style={{ maxHeight: 320 }}>
            {detail.code}
          </pre>
          <h4>Test results</h4>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Status</th>
                <th>Time</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {detail.results.map((r) => (
                <tr key={r.index}>
                  <td>{r.index}</td>
                  <td>
                    <span className={`badge ${statusClass(r.status)}`}>{r.status}</span>
                  </td>
                  <td className="muted small">{r.timeMs} ms</td>
                  <td className="muted small">{r.message ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}

function statusClass(status: string): string {
  if (status === "OK") return "ok";
  if (status === "PENDING" || status === "JUDGING") return "warn";
  if (status === "WRONG_ANSWER") return "fail";
  return "fail";
}
