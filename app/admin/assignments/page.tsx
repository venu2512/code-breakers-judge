"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "../../_components/AdminShell";
import { apiGet, apiPost } from "../../_lib/api";

interface Assignment {
  team_id: number;
  team_name: string;
  members: string | null;
  problem_id: number;
  problem_code: string;
  problem_title: string;
}
interface TeamLite {
  id: number;
  name: string;
  members: string | null;
  eligible_round: number;
}
interface ProblemLite {
  id: number;
  code: string;
  title: string;
}

export default function AdminAssignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [teams, setTeams] = useState<TeamLite[]>([]);
  const [problems, setProblems] = useState<ProblemLite[]>([]);
  const [unassigned, setUnassigned] = useState(0);
  const [round, setRound] = useState(1);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{
        assignments: Assignment[];
        teams: TeamLite[];
        problems: ProblemLite[];
        unassignedCount: number;
        round: number;
      }>("/api/admin/assignments");
      setAssignments(res.assignments);
      setTeams(res.teams);
      setProblems(res.problems);
      setUnassigned(res.unassignedCount);
      setRound(res.round);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setError("");
    setMessage("");
    try {
      const res = await apiPost<{ assigned?: number }>("/api/admin/assignments", {
        action,
        ...extra,
      });
      setMessage(
        action === "swap" ? "Problem swapped" : `Assigned ${res.assigned ?? 0} team(s)`
      );
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  const byTeam = new Map(assignments.map((a) => [a.team_id, a]));

  return (
    <AdminShell title="Assignments">
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      <div className="card">
        <div className="row spread">
          <div>
            <span className="muted">
              Round {round} · {assignments.length} assigned · {unassigned} not assigned
            </span>
          </div>
          <div className="row">
            <button onClick={() => act("assign-missing")} disabled={unassigned === 0}>
              Assign missing
            </button>
            <button
              className="danger"
              onClick={() => {
                if (confirm("Reassign every team? This resets current assignments.")) {
                  act("assign-all");
                }
              }}
            >
              Reassign all
            </button>
          </div>
        </div>
        <p className="muted small">
          Problems are shuffled round-robin so each problem is used about equally.
          Only teams that qualified for this round are assigned a problem. Teams
          marked “out” can still log in but cannot run or submit.
        </p>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Members</th>
              <th>Round status</th>
              <th>Problem</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const a = byTeam.get(t.id);
              const qualified = t.eligible_round >= round;
              return (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td className="muted small">{t.members ?? "—"}</td>
                  <td>
                    {qualified ? (
                      <span className="badge ok">in</span>
                    ) : (
                      <span className="badge fail">out</span>
                    )}
                  </td>
                  <td>
                    {a ? (
                      <>
                        <span className="mono">{a.problem_code}</span> {a.problem_title}
                      </>
                    ) : (
                      <span className="badge warn">unassigned</span>
                    )}
                  </td>
                  <td>
                    <select
                      value={a?.problem_id ?? ""}
                      disabled={!qualified}
                      onChange={(e) =>
                        e.target.value &&
                        act("swap", { teamId: t.id, problemId: Number(e.target.value) })
                      }
                    >
                      <option value="">— choose —</option>
                      {problems.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} {p.title}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
