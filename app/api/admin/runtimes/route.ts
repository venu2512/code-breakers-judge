import { spawnSync } from "node:child_process";
import { handler, ok, requireRole } from "@/lib/api";

export const runtime = "nodejs";

interface Tool {
  language: string;
  command: string;
  args: string[];
}

const TOOLS: Tool[] = [
  { language: "python", command: "python", args: ["--version"] },
  { language: "c", command: "gcc", args: ["--version"] },
  { language: "cpp", command: "g++", args: ["--version"] },
  { language: "java", command: "javac", args: ["-version"] },
  { language: "javascript", command: "node", args: ["--version"] },
];

/** Diagnostics: which language runtimes are reachable from the server process. */
export const GET = handler(async () => {
  await requireRole("admin");
  const results = TOOLS.map((t) => {
    const res = spawnSync(t.command, t.args, {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000,
    });
    const available = res.status === 0 && !res.error;
    const output = `${res.stdout || ""}${res.stderr || ""}`.trim().split("\n")[0];
    return {
      language: t.language,
      command: t.command,
      available,
      version: available ? output : null,
      error: res.error ? res.error.message : null,
    };
  });
  return ok({ tools: results });
});
