"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { apiGet, apiPost } from "../_lib/api";
import { useSession } from "../_lib/useSession";
import { TEMPLATES } from "@/lib/templates";
import { LANGUAGE_LABELS, type Language } from "@/lib/languages";
import type { ContestStatusView, TestResult } from "@/lib/types";

// Monaco must not render on the server.
const CodeEditor = dynamic(() => import("../_components/CodeEditor"), {
  ssr: false,
});

interface ProblemPayload {
  qualified?: boolean;
  assigned: boolean;
  round?: number;
  problem: null | {
    id: number;
    code: string;
    title: string;
    statement: string;
    timeLimitMs: number;
    samples: { input: string; expected: string }[];
  };
}

const AUTOSAVE_MS = 5000;
const BLOCK_PASTE = process.env.NEXT_PUBLIC_BLOCK_PASTE === "1";

export default function ContestPage() {
  const session = useSession("team");
  const router = useRouter();

  const [status, setStatus] = useState<ContestStatusView | null>(null);
  const [problem, setProblem] = useState<ProblemPayload["problem"]>(null);
  const [assigned, setAssigned] = useState<boolean | null>(null);
  const [qualified, setQualified] = useState<boolean | null>(null);
  const [round, setRound] = useState<number | null>(null);

  const [language, setLanguage] = useState<Language>("python");
  const [codeByLang, setCodeByLang] = useState<Partial<Record<Language, string>>>({});
  const [dirty, setDirty] = useState(false);

  const [runResult, setRunResult] = useState<null | {
    status: string;
    passed: number;
    total: number;
    results: TestResult[];
  }>(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  // Server-clock offset, refreshed on every poll.
  const [offsetMs, setOffsetMs] = useState(0);
  const [serverEndsAt, setServerEndsAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const languageRef = useRef<Language>("python");
  languageRef.current = language;

  // ---- load autosaved code ----
  useEffect(() => {
    if (!session || session.role !== "team") return;
    const savedLang = (localStorage.getItem("cb_lang") as Language) || null;
    apiGet<{ code: Partial<Record<Language, string>> }>("/api/team/code")
      .then(({ code }) => {
        setCodeByLang((prev) => ({ ...prev, ...code }));
        const initial =
          savedLang && LANGUAGE_LABELS[savedLang] ? savedLang : null;
        if (initial) setLanguage(initial);
      })
      .catch(() => {});
  }, [session]);

  // ---- poll contest state ----
  useEffect(() => {
    if (!session || session.role !== "team") return;
    let active = true;
    async function poll() {
      try {
        const s = await apiGet<ContestStatusView>("/api/contest/state");
        if (!active) return;
        setStatus(s);
        setOffsetMs(s.serverTime - Date.now());
        if (s.state === "running" && s.secondsRemaining > 0) {
          setServerEndsAt(s.serverTime + s.secondsRemaining * 1000);
        } else {
          setServerEndsAt(null);
        }
      } catch (err) {
        if (String(err).includes("401")) router.replace("/login");
      }
    }
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [session, router]);

  // ---- clock tick for the timer bar ----
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ---- optional proctoring + kiosk lock when contest is running/locked down ----
  const [lockdownActive, setLockdownActive] = useState(false);
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const fsAttemptedRef = useRef(false);

  useEffect(() => {
    setLockdownActive(Boolean(status?.lockdown && status?.state === "running"));
  }, [status]);

  useEffect(() => {
    function onFsChange() {
      setFullscreenActive(
        Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement)
      );
    }
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange" as any, onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange" as any, onFsChange);
    };
  }, []);

  useEffect(() => {
    if (!lockdownActive) return;
    async function tryFullscreen() {
      if (fsAttemptedRef.current) return;
      fsAttemptedRef.current = true;
      try {
        const elem = document.documentElement as any;
        if (elem.requestFullscreen) {
          await elem.requestFullscreen({ navigationUI: "hide" });
        } else if (elem.webkitRequestFullscreen) {
          await elem.webkitRequestFullscreen();
        }
      } catch {
        // Ignore if user denies or browser blocks
      }
    }
    tryFullscreen();
  }, [lockdownActive]);

  useEffect(() => {
    if (!session || session.role !== "team") return;
    function onVisibility() {
      if (document.hidden) {
        apiPost("/api/team/event", {
          kind: "tab-switch",
          detail: new Date().toISOString(),
        }).catch(() => {});
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [session]);

  // ---- fetch assigned problem once the contest is running ----
  const loadProblem = useCallback(async () => {
    try {
      const p = await apiGet<ProblemPayload>("/api/team/problem");
      setQualified(p.qualified ?? true);
      setRound(p.round ?? null);
      setAssigned(p.assigned);
      setProblem(p.problem);
    } catch {
      /* ignore transient errors */
    }
  }, []);

  useEffect(() => {
    if (status?.state === "running") loadProblem();
  }, [status?.state, loadProblem]);

  const allowed = status?.allowedLanguages ?? ["python"];
  useEffect(() => {
    if (status && !allowed.includes(language)) {
      setLanguage(allowed[0] ?? "python");
    }
  }, [status, allowed, language]);

  // ---- current code = saved code or the starter template ----
  const code = codeByLang[language] ?? TEMPLATES[language];

  const running_ = status?.state === "running";

  // ---- autosave (debounced) ----
  useEffect(() => {
    if (!session || session.role !== "team" || !running_) return;
    if (!dirty) return;
    const id = setTimeout(async () => {
      try {
        await apiPost("/api/team/code", { language, code });
        setDirty(false);
      } catch {
        /* keep dirty so we retry */
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(id);
  }, [code, dirty, language, running_, session]);

  // Save to localStorage immediately on every change.
  useEffect(() => {
    if (!session || session.role !== "team") return;
    localStorage.setItem(`cb_code_${language}`, code);
    localStorage.setItem("cb_lang", language);
  }, [code, language, session]);

  function updateCode(next: string) {
    setCodeByLang((prev) => ({ ...prev, [language]: next }));
    setDirty(true);
  }

  async function handleLogout() {
    await apiPost("/api/admin/logout").catch(() => {});
    router.replace("/login");
  }

  async function handleRun() {
    setError("");
    setNotice("");
    setRunResult(null);
    setRunning(true);
    try {
      const res = await apiPost<{
        status: string;
        passed: number;
        total: number;
        results: TestResult[];
      }>("/api/run", { language, code });
      setRunResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  async function handleSubmit() {
    setConfirmOpen(false);
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      await apiPost("/api/submit", { language, code });
      setDirty(false);
      setNotice(
        `Submission received at ${new Date().toLocaleTimeString()}. Good luck!`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  const serverNow = nowTick + offsetMs;
  const secondsLeft = useMemo(() => {
    if (!serverEndsAt) return status?.secondsRemaining ?? 0;
    return Math.max(0, Math.round((serverEndsAt - serverNow) / 1000));
  }, [serverEndsAt, serverNow, status]);

  if (!session || session.role !== "team") {
    return (
      <div className="wrap">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const state = status?.state ?? "waiting";

  const containerClass = lockdownActive ? "wrap wrap-wide contest-kiosk" : "wrap wrap-wide";
  const style: React.CSSProperties = lockdownActive
    ? { position: "relative", zIndex: 1, background: "var(--bg)" }
    : {};

  return (
    <div className={containerClass} style={style}>
      <div className="row spread" style={{ marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0 }}>Code Breakers</h1>
          <span className="muted small">
            {session.name} · {status ? `Round ${status.currentRound} of ${status.totalRounds}` : ""}{" "}
            · {problem ? problem.title : "no problem yet"}
          </span>
        </div>
        <div className="row">
          <StateBadge state={state} />
          <button className="sm ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>

      {state === "waiting" && <WaitingScreen status={status} />}

      {state === "paused" && (
        <div className="card" style={{ textAlign: "center" }}>
          <h2>Contest paused</h2>
          <p className="muted">
            The timer is stopped. Please wait for the judge to resume.
          </p>
          <Countdown seconds={secondsLeft} />
        </div>
      )}

      {(state === "running" || state === "ended") && (
        <>
          <TimerBar
            secondsLeft={secondsLeft}
            durationSeconds={status?.durationSeconds ?? 2700}
          />

          {qualified === false ? (
            <div className="card">
              <h2>Not qualified for this round</h2>
              <p className="muted">
                You did not advance to round {round ?? status?.currentRound ?? ""}.
                Your account is still active, but you cannot run or submit in this
                round. Please contact the organiser if this is unexpected.
              </p>
            </div>
          ) : !assigned ? (
            <div className="card">
              <p className="muted">
                Your problem has not been assigned yet. Please wait…
              </p>
            </div>
          ) : (
            <div className="split" style={{ marginTop: 16 }}>
              <div className="card" style={{ maxHeight: "80vh", overflow: "auto" }}>
                <h2>{problem?.title}</h2>
                <div className="markdown">{problem?.statement}</div>
                {problem?.samples?.length ? (
                  <>
                    <h3 style={{ marginTop: 18 }}>Samples</h3>
                    {problem.samples.map((s, i) => (
                      <div key={i} className="card" style={{ background: "var(--panel-2)" }}>
                        <div className="small muted">Sample {i + 1} — input</div>
                        <pre className="out">{s.input}</pre>
                        <div className="small muted">Expected output</div>
                        <pre className="out">{s.expected}</pre>
                      </div>
                    ))}
                  </>
                ) : null}
                <p className="muted small">
                  Output comparison ignores trailing spaces on each line and blank
                  lines at the end.
                </p>
              </div>

              <div>
                <div className="row spread" style={{ marginBottom: 8 }}>
                  <div style={{ minWidth: 180 }}>
                    <label htmlFor="lang">Language</label>
                    <select
                      id="lang"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as Language)}
                    >
                      {allowed.map((l) => (
                        <option key={l} value={l}>
                          {LANGUAGE_LABELS[l]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="row">
                    <button onClick={handleRun} disabled={!running_ || running}>
                      {running ? "Running…" : "Run samples"}
                    </button>
                    <button
                      className="primary"
                      onClick={() => setConfirmOpen(true)}
                      disabled={!running_ || submitting}
                    >
                      {submitting ? "Sending…" : "Submit"}
                    </button>
                  </div>
                </div>

                <CodeEditor
                  language={language}
                  value={code}
                  onChange={updateCode}
                  readOnly={!running_}
                  height="420px"
                  blockPaste={BLOCK_PASTE}
                  onPaste={(blocked) =>
                    apiPost("/api/team/event", {
                      kind: "paste",
                      detail: blocked ? "blocked" : "allowed",
                    }).catch(() => {})
                  }
                />

                <div className="row spread small muted" style={{ marginTop: 6 }}>
                  <span>{dirty ? "Saving…" : "All changes saved"}</span>
                  <span>Autosave every {AUTOSAVE_MS / 1000}s</span>
                </div>

                {error && <p className="error">{error}</p>}
                {notice && <p className="success">{notice}</p>}

                {runResult && <RunResults run={runResult} />}
              </div>
            </div>
          )}
        </>
      )}

      {lockdownActive && !fullscreenActive && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            color: "#fff",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            zIndex: 100,
            padding: 20,
          }}
        >
          <h2 style={{ margin: 0 }}>Full screen required</h2>
          <p style={{ opacity: 0.9, marginTop: 8 }}>
            Contest is live. Enter full screen to continue. Do not switch tabs.
          </p>
          <button
            className="primary"
            style={{ marginTop: 16 }}
            onClick={async () => {
              try {
                const elem = document.documentElement as any;
                if (elem.requestFullscreen) {
                  await elem.requestFullscreen({ navigationUI: "hide" });
                } else if (elem.webkitRequestFullscreen) {
                  await elem.webkitRequestFullscreen();
                }
              } catch {
                // ignore
              }
            }}
          >
            Enter Full Screen
          </button>
        </div>
      )}

      {confirmOpen && (
        <ConfirmSubmit
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleSubmit}
        />
      )}
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, string> = {
    waiting: "warn",
    running: "ok",
    paused: "warn",
    ended: "fail",
  };
  return <span className={`badge ${map[state] ?? ""}`}>{state}</span>;
}

function Countdown({ seconds }: { seconds: number }) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return (
    <div className="mono" style={{ fontSize: 40, marginTop: 8 }}>
      {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </div>
  );
}

function WaitingScreen({ status }: { status: ContestStatusView | null }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "48px 20px" }}>
      <h2>Waiting for the contest to start</h2>
      <p className="muted">
        Keep this page open. The problem and timer will appear automatically.
      </p>
      {status && (
        <p className="muted small">
          Contest length: {Math.round(status.durationSeconds / 60)} minutes ·{" "}
          {status.allowedLanguages.length} languages enabled
        </p>
      )}
      <div className="muted small">Checking for the start every 3 seconds…</div>
    </div>
  );
}

function TimerBar({
  secondsLeft,
  durationSeconds,
}: {
  secondsLeft: number;
  durationSeconds: number;
}) {
  const pct = Math.max(0, Math.min(100, (secondsLeft / durationSeconds) * 100));
  const low = secondsLeft <= 300;
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  return (
    <div>
      <div className="row spread small">
        <span className="muted">Time remaining</span>
        <span className={`mono ${low ? "error" : ""}`} style={{ fontSize: 18 }}>
          {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
        </span>
      </div>
      <div className={`timerbar ${low ? "low" : ""}`} style={{ marginTop: 6 }}>
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RunResults({
  run,
}: {
  run: { status: string; passed: number; total: number; results: TestResult[] };
}) {
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row spread">
        <h3 style={{ margin: 0 }}>Sample results</h3>
        <span className={`badge ${run.status === "OK" ? "ok" : "fail"}`}>
          {run.status} · {run.passed}/{run.total}
        </span>
      </div>
      {run.results.map((r) => (
        <div key={r.index} style={{ marginTop: 12 }}>
          <div className="row spread small">
            <strong>Sample {r.index}</strong>
            <span className={`badge ${r.status === "OK" ? "ok" : "fail"}`}>
              {r.status}
            </span>
          </div>
          <div className="small muted">Input</div>
          <pre className="out">{r.input}</pre>
          <div className="small muted">Expected</div>
          <pre className="out">{r.expected}</pre>
          <div className="small muted">Your output</div>
          <pre className="out">{r.actual ?? ""}</pre>
          {r.message && <p className="error small">{r.message}</p>}
        </div>
      ))}
    </div>
  );
}

function ConfirmSubmit({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div className="card" style={{ maxWidth: 420 }}>
        <h2>Submit your solution?</h2>
        <p className="muted small">
          Your code will be judged on the hidden tests. You will not see the
          result — only that the submission was received. You may submit again
          after 15 seconds.
        </p>
        <div className="row spread" style={{ marginTop: 16 }}>
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={onConfirm}>
            Yes, submit
          </button>
        </div>
      </div>
    </div>
  );
}
