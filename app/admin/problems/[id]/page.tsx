"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AdminShell from "../../../_components/AdminShell";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../../_lib/api";
import { ALL_LANGUAGES, LANGUAGE_LABELS, type Language } from "@/lib/languages";
import { TEMPLATES } from "@/lib/templates";
import type { TestResult } from "@/lib/types";

interface Problem {
  id: number;
  code: string;
  title: string;
  statement: string;
  pattern: string | null;
  time_limit_ms: number;
}
interface TestCase {
  id: number;
  input: string;
  expected: string;
  is_sample: number;
  ordinal: number;
}

export default function ProblemDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const [problem, setProblem] = useState<Problem | null>(null);
  const [tests, setTests] = useState<TestCase[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // edit fields
  const [title, setTitle] = useState("");
  const [pattern, setPattern] = useState("");
  const [statement, setStatement] = useState("");
  const [timeLimitMs, setTimeLimitMs] = useState(2000);

  // new test
  const [input, setInput] = useState("");
  const [expected, setExpected] = useState("");
  const [isSample, setIsSample] = useState(true);

  // validation
  const [refLang, setRefLang] = useState<Language>("python");
  const [refCode, setRefCode] = useState("");
  const [validation, setValidation] = useState<null | {
    ok: boolean;
    samplesPassed: number;
    samplesTotal: number;
    hiddenPassed: number;
    hiddenTotal: number;
    failures: TestResult[];
  }>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ problem: Problem; tests: TestCase[] }>(
        `/api/admin/problems/${id}`
      );
      setProblem(res.problem);
      setTests(res.tests);
      setTitle(res.problem.title);
      setPattern(res.problem.pattern ?? "");
      setStatement(res.problem.statement);
      setTimeLimitMs(res.problem.time_limit_ms);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  async function saveProblem() {
    setError("");
    setMessage("");
    try {
      await apiPatch(`/api/admin/problems/${id}`, {
        title,
        pattern,
        statement,
        timeLimitMs,
      });
      setMessage("Problem saved");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function addTest() {
    setError("");
    setMessage("");
    try {
      await apiPost(`/api/admin/problems/${id}/tests`, { input, expected, is_sample: isSample });
      setInput("");
      setExpected("");
      setMessage("Test added");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add test failed");
    }
  }

  async function delTest(testId: number) {
    if (!confirm("Delete this test case?")) return;
    try {
      await apiDelete(`/api/admin/problems/${id}/tests/${testId}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function toggleSample(t: TestCase) {
    try {
      await apiPatch(`/api/admin/problems/${id}/tests/${t.id}`, {
        is_sample: !t.is_sample,
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function validate() {
    setError("");
    setMessage("");
    setValidation(null);
    try {
      const res = await apiPost<{
        ok: boolean;
        samplesPassed: number;
        samplesTotal: number;
        hiddenPassed: number;
        hiddenTotal: number;
        failures: TestResult[];
      }>(`/api/admin/problems/${id}/validate`, {
        language: refLang,
        code: refCode || TEMPLATES[refLang],
      });
      setValidation(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    }
  }

  async function rejudgeProblem() {
    if (!confirm("Rejudge every submission for this problem?")) return;
    try {
      const res = await apiPost<{ rejudging: number }>(
        "/api/admin/submissions/rejudge-problem",
        { problemId: id }
      );
      setMessage(`Rejudging ${res.rejudging} submission(s)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejudge failed");
    }
  }

  const samples = tests.filter((t) => t.is_sample);
  const hidden = tests.filter((t) => !t.is_sample);

  return (
    <AdminShell title={problem ? `${problem.code} · ${problem.title}` : "Problem"}>
      <p className="muted small">
        <Link href="/admin/problems">← back to problems</Link>
      </p>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      <div className="card">
        <h3>Edit problem</h3>
        <div className="grid grid-2">
          <div>
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label>Pattern</label>
            <input value={pattern} onChange={(e) => setPattern(e.target.value)} />
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
          <label>Statement</label>
          <textarea rows={10} value={statement} onChange={(e) => setStatement(e.target.value)} />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" onClick={saveProblem}>
            Save problem
          </button>
          <button onClick={rejudgeProblem}>Rejudge all submissions</button>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3>Add test case</h3>
          <label>Input</label>
          <textarea rows={4} value={input} onChange={(e) => setInput(e.target.value)} />
          <label style={{ marginTop: 8 }}>Expected output</label>
          <textarea rows={3} value={expected} onChange={(e) => setExpected(e.target.value)} />
          <label className="row" style={{ marginTop: 8, gap: 6 }}>
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={isSample}
              onChange={(e) => setIsSample(e.target.checked)}
            />
            Sample (visible to teams)
          </label>
          <button className="primary" style={{ marginTop: 10 }} onClick={addTest}>
            Add test
          </button>
        </div>

        <div className="card">
          <h3>Validate with a reference solution</h3>
          <p className="muted small">
            Runs against every sample and hidden test through the real runner.
            Do this before the event.
          </p>
          <div className="row">
            <div style={{ width: 200 }}>
              <label>Language</label>
              <select value={refLang} onChange={(e) => setRefLang(e.target.value as Language)}>
                {ALL_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {LANGUAGE_LABELS[l]}
                  </option>
                ))}
              </select>
            </div>
            <button style={{ marginTop: 20 }} onClick={validate}>
              Validate
            </button>
          </div>
          <textarea
            rows={8}
            style={{ marginTop: 8 }}
            placeholder="Reference solution code"
            value={refCode}
            onChange={(e) => setRefCode(e.target.value)}
          />
          {validation && (
            <div style={{ marginTop: 10 }}>
              <span className={`badge ${validation.ok ? "ok" : "fail"}`}>
                {validation.ok ? "ALL PASS" : "FAILURES"}
              </span>
              <p className="small muted">
                samples {validation.samplesPassed}/{validation.samplesTotal} · hidden{" "}
                {validation.hiddenPassed}/{validation.hiddenTotal}
              </p>
              {validation.failures.map((f, i) => (
                <div key={i} className="small" style={{ marginTop: 6 }}>
                  <span className="badge fail">{f.status}</span>{" "}
                  {f.sample ? `sample #${f.index}` : `hidden #${f.index}`}
                  {f.input !== undefined && (
                    <pre className="out">input: {f.input}</pre>
                  )}
                  {f.actual !== undefined && <pre className="out">got: {f.actual}</pre>}
                  {f.message && <p className="error small">{f.message}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3>Samples ({samples.length})</h3>
          {samples.map((t) => (
            <div key={t.id} className="card" style={{ background: "var(--panel-2)" }}>
              <div className="row spread">
                <span className="small muted">#{t.id}</span>
                <div className="row">
                  <button className="sm" onClick={() => toggleSample(t)}>
                    Make hidden
                  </button>
                  <button className="sm danger" onClick={() => delTest(t.id)}>
                    Delete
                  </button>
                </div>
              </div>
              <pre className="out">in: {t.input}</pre>
              <pre className="out">out: {t.expected}</pre>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>
            Hidden ({hidden.length})
            {hidden.length < 10 && <span className="badge warn"> aim for 10-15</span>}
          </h3>
          {hidden.map((t) => (
            <div key={t.id} className="card" style={{ background: "var(--panel-2)" }}>
              <div className="row spread">
                <span className="small muted">#{t.id}</span>
                <div className="row">
                  <button className="sm" onClick={() => toggleSample(t)}>
                    Make sample
                  </button>
                  <button className="sm danger" onClick={() => delTest(t.id)}>
                    Delete
                  </button>
                </div>
              </div>
              <pre className="out">in: {t.input}</pre>
              <pre className="out">out: {t.expected}</pre>
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
