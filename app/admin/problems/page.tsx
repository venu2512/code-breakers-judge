"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "../../_components/AdminShell";
import { apiGet, apiPost } from "../../_lib/api";

interface ProblemRow {
  id: number;
  code: string;
  title: string;
  pattern: string | null;
  time_limit_ms: number;
  samples: number;
  hidden: number;
  assigned: number;
}

export default function AdminProblems() {
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [pattern, setPattern] = useState("");
  const [statement, setStatement] = useState("");
  const [timeLimitMs, setTimeLimitMs] = useState(2000);

  const load = useCallback(async () => {
    try {
      const { problems } = await apiGet<{ problems: ProblemRow[] }>("/api/admin/problems");
      setProblems(problems);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      const res = await apiPost<{ id: number }>("/api/admin/problems", {
        code,
        title,
        pattern,
        statement,
        timeLimitMs,
      });
      setMessage(`Problem ${code} created. Add test cases next.`);
      setCode("");
      setTitle("");
      setPattern("");
      setStatement("");
      load();
      window.location.href = `/admin/problems/${res.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <AdminShell title="Problems">
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      <div className="card">
        <div className="row spread">
          <h3 style={{ margin: 0 }}>Problems ({problems.length})</h3>
          <button className="sm" onClick={load}>
            Refresh
          </button>
        </div>
        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Title</th>
              <th>Pattern</th>
              <th>Samples</th>
              <th>Hidden</th>
              <th>Assigned</th>
              <th>Limit</th>
            </tr>
          </thead>
          <tbody>
            {problems.map((p) => (
              <tr key={p.id}>
                <td className="mono">{p.code}</td>
                <td>
                  <Link href={`/admin/problems/${p.id}`}>{p.title}</Link>
                </td>
                <td className="muted small">{p.pattern ?? "—"}</td>
                <td>{p.samples}</td>
                <td>
                  {p.hidden > 0 ? p.hidden : <span className="badge fail">0</span>}
                </td>
                <td>{p.assigned}</td>
                <td className="muted small">{p.time_limit_ms} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="card" onSubmit={create}>
        <h3>Create a problem</h3>
        <div className="grid grid-2">
          <div>
            <label>Code (unique, e.g. A1)</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} required />
          </div>
          <div>
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <label>Pattern (optional)</label>
            <input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="e.g. input-parsing"
            />
          </div>
          <div>
            <label>Time limit (ms)</label>
            <input
              type="number"
              value={timeLimitMs}
              onChange={(e) => setTimeLimitMs(Number(e.target.value))}
            />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <label>Statement (markdown-ish plain text is fine)</label>
          <textarea
            rows={8}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            required
          />
        </div>
        <button className="primary" style={{ marginTop: 12 }} type="submit">
          Create problem
        </button>
      </form>
    </AdminShell>
  );
}
