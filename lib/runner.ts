import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  COMPILE_TIME_LIMIT_MS,
  DEFAULT_TIME_LIMIT_MS,
  LANGUAGE_FILE,
  OUTPUT_CAP_BYTES,
  type Language,
  config,
} from "./config";
import { LANGUAGE_TIME_MULTIPLIER } from "./languages";
import { buildRunCommand } from "./sandbox";
import type { JudgeStatus } from "./types";
import { ensureConfig } from "./bootstrap";

ensureConfig();

const IS_WINDOWS = process.platform === "win32";

export interface RunOptions {
  language: Language;
  code: string;
  stdin: string;
  timeLimitMs?: number;
}

export interface RunResult {
  status: JudgeStatus;
  stdout: string;
  stderr: string;
  timeMs: number;
  message?: string;
}

interface ExecResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputExceeded: boolean;
  spawnError?: string;
  timeMs: number;
}

/** The compile command for a language, or undefined when not needed. */
function compileCommandFor(language: Language): string[] | undefined {
  const exe = IS_WINDOWS ? "main.exe" : "main";
  switch (language) {
    case "python":
    case "javascript":
      return undefined;
    case "c":
      return ["gcc", "-O2", "-std=c11", "main.c", "-o", exe];
    case "cpp":
      return ["g++", "-O2", "-std=c++17", "main.cpp", "-o", exe];
    case "java":
      return ["javac", "-encoding", "UTF-8", "Main.java"];
  }
}

/**
 * Build the run command with whatever resource limits the OS supports.
 * See lib/sandbox.ts for the details of what is capped where.
 */
function runCommandFor(language: Language, timeLimitMs: number): string[] {
  return buildRunCommand({
    language,
    platform: process.platform,
    memoryLimitMB: config.memoryLimitMB,
    javaMaxHeapMB: config.javaMaxHeapMB,
    timeLimitMs,
  });
}

/**
 * Run a command with a hard time limit and an output cap.
 * On timeout the whole process tree is killed so no orphan survives.
 */
function exec(
  cmd: string,
  args: string[],
  opts: { cwd: string; stdin?: string; timeLimitMs: number }
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let timedOut = false;
    let outputExceeded = false;
    let settled = false;
    let spawnError: string | undefined;

    let child: ChildProcess;
    try {
      child = spawn(cmd, args, {
        cwd: opts.cwd,
        windowsHide: true,
        detached: !IS_WINDOWS, // new process group on POSIX for clean kill
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      resolve({
        code: null,
        signal: null,
        stdout: "",
        stderr: "",
        timedOut: false,
        outputExceeded: false,
        spawnError: err instanceof Error ? err.message : String(err),
        timeMs: Date.now() - started,
      });
      return;
    }

    const kill = () => {
      if (child.pid == null) return;
      if (IS_WINDOWS) {
        // Kill the process tree (java/gcc can spawn children).
        try {
          spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
            windowsHide: true,
          });
        } catch {
          /* ignore */
        }
      } else {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          /* ignore */
        }
      }
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, opts.timeLimitMs);

    const append = (target: "out" | "err", chunk: Buffer): boolean => {
      if (target === "out") {
        if (stdout.length < OUTPUT_CAP_BYTES) {
          stdout = Buffer.concat([stdout, chunk]).subarray(0, OUTPUT_CAP_BYTES);
        }
      } else {
        if (stderr.length < OUTPUT_CAP_BYTES) {
          stderr = Buffer.concat([stderr, chunk]).subarray(0, OUTPUT_CAP_BYTES);
        }
      }
      if (stdout.length >= OUTPUT_CAP_BYTES || stderr.length >= OUTPUT_CAP_BYTES) {
        outputExceeded = true;
        kill();
        return false;
      }
      return true;
    };

    child.stdout?.on("data", (chunk: Buffer) => append("out", chunk));
    child.stderr?.on("data", (chunk: Buffer) => append("err", chunk));

    child.on("error", (err) => {
      spawnError = err.message;
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          code: null,
          signal: null,
          stdout: stdout.toString("utf8"),
          stderr: stderr.toString("utf8"),
          timedOut,
          outputExceeded,
          spawnError,
          timeMs: Date.now() - started,
        });
      }
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code,
        signal,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        timedOut,
        outputExceeded,
        spawnError,
        timeMs: Date.now() - started,
      });
    });

    if (child.stdin) {
      child.stdin.on("error", () => {
        /* EPIPE when the program exits early; safe to ignore */
      });
      child.stdin.write(opts.stdin ?? "");
      child.stdin.end();
    }
  });
}

/**
 * Compile (if needed) and run one submission in an isolated temp folder.
 * The folder is always removed before returning.
 */
export async function runSubmission(opts: RunOptions): Promise<RunResult> {
  const base = opts.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS;
  const timeLimit = Math.round(base * LANGUAGE_TIME_MULTIPLIER[opts.language]);
  let dir: string | null = null;
  try {
    dir = await mkdtemp(path.join(os.tmpdir(), "cb-run-"));
    const file = LANGUAGE_FILE[opts.language];
    await writeFile(path.join(dir, file), opts.code, "utf8");

    const compile = compileCommandFor(opts.language);

    if (compile) {
      const [c, ...cargs] = compile;
      const compiled = await exec(c, cargs, {
        cwd: dir,
        timeLimitMs: COMPILE_TIME_LIMIT_MS,
      });
      if (compiled.spawnError) {
        return {
          status: "COMPILE_ERROR",
          stdout: "",
          stderr: "",
          timeMs: compiled.timeMs,
          message: `Compiler not available: ${compiled.spawnError}`,
        };
      }
      if (compiled.timedOut) {
        return {
          status: "COMPILE_ERROR",
          stdout: compiled.stdout,
          stderr: compiled.stderr,
          timeMs: compiled.timeMs,
          message: "Compilation timed out",
        };
      }
      if (compiled.code !== 0) {
        return {
          status: "COMPILE_ERROR",
          stdout: compiled.stdout,
          stderr: compiled.stderr,
          timeMs: compiled.timeMs,
          message: "Compilation failed",
        };
      }
    }

    const [r, ...rargs] = runCommandFor(opts.language, timeLimit);
    const ran = await exec(r, rargs, {
      cwd: dir,
      stdin: opts.stdin,
      timeLimitMs: timeLimit,
    });

    if (ran.spawnError) {
      return {
        status: "INTERNAL_ERROR",
        stdout: "",
        stderr: "",
        timeMs: ran.timeMs,
        message: `Runtime not available: ${ran.spawnError}`,
      };
    }
    if (ran.timedOut) {
      return {
        status: "TIME_LIMIT_EXCEEDED",
        stdout: ran.stdout,
        stderr: ran.stderr,
        timeMs: ran.timeMs,
        message: `Time limit exceeded (${timeLimit} ms)`,
      };
    }
    if (ran.outputExceeded) {
      return {
        status: "OUTPUT_LIMIT_EXCEEDED",
        stdout: ran.stdout,
        stderr: ran.stderr,
        timeMs: ran.timeMs,
        message: "Output limit exceeded",
      };
    }
    if (ran.code !== 0) {
      return {
        status: "RUNTIME_ERROR",
        stdout: ran.stdout,
        stderr: ran.stderr,
        timeMs: ran.timeMs,
        message: `Exited with code ${ran.code}${ran.signal ? ` (${ran.signal})` : ""}`,
      };
    }
    return {
      status: "OK",
      stdout: ran.stdout,
      stderr: ran.stderr,
      timeMs: ran.timeMs,
    };
  } catch (err) {
    return {
      status: "INTERNAL_ERROR",
      stdout: "",
      stderr: "",
      timeMs: 0,
      message: err instanceof Error ? err.message : "Runner failed",
    };
  } finally {
    if (dir) {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        await new Promise((r) => setTimeout(r, 50));
        await rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
}
