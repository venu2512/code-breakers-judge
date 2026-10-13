"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "../../_components/AdminShell";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../_lib/api";

interface TeamRow {
  id: number;
  name: string;
  members: string | null;
  problem_title: string | null;
  submissions: number;
  last_submission: number | null;
}

export default function AdminTeams() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [members, setMembers] = useState("");
  const [csv, setCsv] = useState("team_name,phone,members\n");
  const [editing, setEditing] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const { teams } = await apiGet<{ teams: TeamRow[] }>("/api/admin/teams");
      setTeams(teams);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load teams");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addTeam(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await apiPost("/api/admin/teams", { name, phone, members });
      setName("");
      setPhone("");
      setMembers("");
      setMessage("Team added");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add failed");
    }
  }

  async function importCsv() {
    setError("");
    setMessage("");
    try {
      const res = await apiPost<{ added: number; skipped: number }>(
        "/api/admin/teams/import",
        { csv }
      );
      setMessage(`Imported ${res.added} team(s), skipped ${res.skipped}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    }
  }

  async function remove(id: number, teamName: string) {
    if (!confirm(`Delete team "${teamName}" and all its submissions?`)) return;
    try {
      await apiDelete(`/api/admin/teams/${id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function saveEdit(
    id: number,
    patch: { name?: string; phone?: string; members?: string }
  ) {
    setError("");
    try {
      await apiPatch(`/api/admin/teams/${id}`, patch);
      setEditing(null);
      setMessage("Team updated");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <AdminShell title="Teams">
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      <div className="grid grid-2">
        <form className="card" onSubmit={addTeam}>
          <h3>Add a team</h3>
          <div>
            <label>Team name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div style={{ marginTop: 10 }}>
            <label>Phone number (login password)</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="numeric"
              required
            />
          </div>
          <div style={{ marginTop: 10 }}>
            <label>Members (optional)</label>
            <input value={members} onChange={(e) => setMembers(e.target.value)} />
          </div>
          <button className="primary" style={{ marginTop: 12 }} type="submit">
            Add team
          </button>
        </form>

        <div className="card">
          <h3>Import CSV</h3>
          <p className="muted small">
            Columns: <span className="mono">team_name,phone,members</span>. A header
            row is optional. Duplicate names are skipped.
          </p>
          <textarea
            rows={7}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
          <button className="primary" style={{ marginTop: 10 }} onClick={importCsv}>
            Import
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row spread">
          <h3 style={{ margin: 0 }}>All teams ({teams.length})</h3>
          <button className="sm" onClick={load}>
            Refresh
          </button>
        </div>
        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Team</th>
              <th>Members</th>
              <th>Problem</th>
              <th>Submissions</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id}>
                {editing === t.id ? (
                  <EditRow team={t} onCancel={() => setEditing(null)} onSave={saveEdit} />
                ) : (
                  <>
                    <td>{t.name}</td>
                    <td className="muted small">{t.members ?? "—"}</td>
                    <td className="muted small">{t.problem_title ?? "—"}</td>
                    <td>{t.submissions}</td>
                    <td className="row">
                      <button className="sm" onClick={() => setEditing(t.id)}>
                        Edit
                      </button>
                      <button className="sm danger" onClick={() => remove(t.id, t.name)}>
                        Delete
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}

function EditRow({
  team,
  onCancel,
  onSave,
}: {
  team: TeamRow;
  onCancel: () => void;
  onSave: (id: number, patch: { name: string; phone?: string; members: string }) => void;
}) {
  const [name, setName] = useState(team.name);
  const [phone, setPhone] = useState("");
  const [members, setMembers] = useState(team.members ?? "");
  return (
    <>
      <td>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td>
        <input
          placeholder="new phone (leave blank to keep)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <input
          style={{ marginTop: 4 }}
          placeholder="members"
          value={members}
          onChange={(e) => setMembers(e.target.value)}
        />
      </td>
      <td className="muted small">{team.problem_title ?? "—"}</td>
      <td>{team.submissions}</td>
      <td className="row">
        <button
          className="sm primary"
          onClick={() => onSave(team.id, { name, members, ...(phone ? { phone } : {}) })}
        >
          Save
        </button>
        <button className="sm" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </>
  );
}
