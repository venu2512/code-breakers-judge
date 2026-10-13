import type { Language } from "./languages";

/**
 * Build the command used to run a submission.
 *
 * This is where the resource limits that the operating system can enforce are
 * applied. It is a pure function (no I/O, no process.env) so it can be unit
 * tested on any platform.
 *
 * What is enforced where:
 *  - Java:        -Xmx<heap>m (every platform)
 *  - JavaScript:  --max-old-space-size (V8 heap; every platform)
 *  - POSIX only:  `ulimit -v` (address space) for C, C++ and Python, plus
 *                 `ulimit -t` (CPU seconds) for every language as a backstop.
 *  - Windows:     C, C++ and Python have no portable memory cap, so they run
 *                 with the wall-clock limit only. Keep the server offline and
 *                 run it as a non-admin user (see README).
 */

export interface RunCommandOptions {
  language: Language;
  platform: NodeJS.Platform;
  /** Address-space / heap cap in MB. 0 disables the limit. */
  memoryLimitMB: number;
  /** JVM heap cap in MB (Java only). */
  javaMaxHeapMB: number;
  /** Wall-clock limit for this run, in milliseconds. */
  timeLimitMs: number;
}

/**
 * Languages whose process can safely be constrained with `ulimit -v`.
 * The JVM and V8 reserve large virtual address ranges, so they use their own
 * heap flags instead and would fail to start under an address-space cap.
 */
const ADDRESS_SPACE_CAPPED: Record<Language, boolean> = {
  python: true,
  c: true,
  cpp: true,
  java: false,
  javascript: false,
};

export function buildRunCommand(opts: RunCommandOptions): string[] {
  const isWindows = opts.platform === "win32";
  const exe = isWindows ? "main.exe" : "./main";

  let base: string[];
  switch (opts.language) {
    case "python":
      base = ["python", "main.py"];
      break;
    case "javascript":
      base =
        opts.memoryLimitMB > 0
          ? ["node", `--max-old-space-size=${opts.memoryLimitMB}`, "main.js"]
          : ["node", "main.js"];
      break;
    case "c":
      base = [exe];
      break;
    case "cpp":
      base = [exe];
      break;
    case "java":
      base = ["java", `-Xmx${opts.javaMaxHeapMB}m`, "-cp", ".", "Main"];
      break;
  }

  if (isWindows) return base;

  // POSIX: run through `sh -c` so we can set rlimits before exec'ing the
  // program. `exec "$0" "$@"` keeps the same PID/process group, so the
  // existing kill logic still reaps the whole tree on timeout.
  const memoryKb = opts.memoryLimitMB > 0 ? opts.memoryLimitMB * 1024 : 0;
  const cpuSeconds = Math.max(1, Math.ceil(opts.timeLimitMs / 1000) + 1);

  const limits: string[] = [];
  if (memoryKb > 0 && ADDRESS_SPACE_CAPPED[opts.language]) {
    limits.push(`ulimit -v ${memoryKb}`);
  }
  limits.push(`ulimit -t ${cpuSeconds}`);

  const script = `${limits.join("; ")}; exec "$0" "$@"`;
  return ["/bin/sh", "-c", script, base[0], ...base.slice(1)];
}
