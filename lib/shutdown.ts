const handlers: Array<() => void> = [];

export function onShutdown(fn: () => void) {
  handlers.push(fn);
}

function run() {
  for (const h of handlers) {
    try {
      h();
    } catch {}
  }
}

process.once("SIGINT", () => {
  console.log("[shutdown] SIGINT received");
  run();
});

process.once("SIGTERM", () => {
  console.log("[shutdown] SIGTERM received");
  run();
});

process.once("beforeExit", () => {
  run();
});
