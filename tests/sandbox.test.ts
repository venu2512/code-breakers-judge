import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRunCommand } from "../lib/sandbox";

const base = {
  platform: "win32" as NodeJS.Platform,
  memoryLimitMB: 512,
  javaMaxHeapMB: 256,
  timeLimitMs: 2000,
};

test("windows java uses the JVM heap flag and no shell wrapper", () => {
  const cmd = buildRunCommand({ ...base, language: "java" });
  assert.deepEqual(cmd, ["java", "-Xmx256m", "-cp", ".", "Main"]);
});

test("windows javascript caps the V8 old space", () => {
  const cmd = buildRunCommand({ ...base, language: "javascript" });
  assert.deepEqual(cmd, ["node", "--max-old-space-size=512", "main.js"]);
});

test("windows compiled binaries run directly", () => {
  assert.deepEqual(buildRunCommand({ ...base, language: "c" }), ["main.exe"]);
  assert.deepEqual(buildRunCommand({ ...base, language: "cpp" }), ["main.exe"]);
});

test("posix c/cpp/python get an address-space cap and a cpu backstop", () => {
  for (const language of ["c", "cpp", "python"] as const) {
    const cmd = buildRunCommand({ ...base, platform: "linux", language });
    assert.equal(cmd[0], "/bin/sh", `${language} should be wrapped`);
    assert.equal(cmd[1], "-c");
    assert.match(cmd[2], /ulimit -v 524288/);
    assert.match(cmd[2], /ulimit -t 3/);
    assert.match(cmd[2], /exec "\$0" "\$@"/);
    assert.equal(cmd[3], language === "python" ? "python" : "./main");
  }
});

test("posix java and node are not address-space capped (they reserve VM)", () => {
  const java = buildRunCommand({ ...base, platform: "linux", language: "java" });
  assert.match(java[2], /ulimit -t 3/);
  assert.doesNotMatch(java[2], /ulimit -v/);

  const node = buildRunCommand({ ...base, platform: "linux", language: "javascript" });
  assert.match(node[2], /ulimit -t 3/);
  assert.doesNotMatch(node[2], /ulimit -v/);
});

test("memoryLimitMB of 0 disables the cap everywhere", () => {
  const c = buildRunCommand({ ...base, platform: "linux", language: "c", memoryLimitMB: 0 });
  assert.doesNotMatch(c[2], /ulimit -v/);
  const node = buildRunCommand({ ...base, language: "javascript", memoryLimitMB: 0 });
  assert.deepEqual(node, ["node", "main.js"]);
});

test("cpu backstop is one second longer than the wall-clock limit", () => {
  const cmd = buildRunCommand({ ...base, platform: "linux", language: "cpp", timeLimitMs: 6000 });
  assert.match(cmd[2], /ulimit -t 7/);
});
