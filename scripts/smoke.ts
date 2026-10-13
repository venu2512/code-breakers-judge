/**
 * Runner smoke test. Runs a correct solution, a wrong one, and several
 * hostile programs to prove nothing can hang or crash the server.
 *
 *   npx tsx scripts/smoke.ts
 */
import { runSubmission } from "../lib/runner";

const correctPython = `import sys
a, b = map(int, sys.stdin.read().split())
print(a + b)
`;

const wrongPython = `print(0)
`;

const infinitePython = `while True:
    pass
`;

const hugeOutputPython = `for i in range(1000000):
    print("x" * 100)
`;

const crashPython = `raise SystemExit(3)
`;

const correctJs = `const fs = require("fs");
const [a,b] = fs.readFileSync(0,"utf8").trim().split(/\\s+/).map(Number);
console.log(a+b);
`;

async function run(name: string, code: string, lang: "python" | "javascript") {
  const res = await runSubmission({
    language: lang,
    code,
    stdin: "2 3\n",
    timeLimitMs: 2000,
  });
  console.log(
    `${name.padEnd(22)} status=${res.status.padEnd(22)} time=${res.timeMs}ms ` +
      `stdout=${JSON.stringify(res.stdout.slice(0, 40))}${
        res.message ? ` msg=${res.message}` : ""
      }`
  );
  return res;
}

async function main() {
  await run("correct python", correctPython, "python");
  await run("wrong python", wrongPython, "python");
  await run("infinite loop", infinitePython, "python");
  await run("huge output", hugeOutputPython, "python");
  await run("crash (exit 3)", crashPython, "python");
  await run("correct javascript", correctJs, "javascript");
  console.log("\nIf every line above returned, the runner is safe.");
}

main();
