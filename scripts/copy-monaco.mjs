/**
 * Copy Monaco's prebuilt static files into public/monaco so the editor is
 * served entirely by our own server. No internet required at contest time.
 *
 * Run automatically by `postinstall`, `predev` and `prebuild`.
 */
import { cp, mkdir, rm, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const src = path.join(root, "node_modules", "monaco-editor", "min", "vs");
const dest = path.join(root, "public", "monaco", "vs");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(src))) {
    console.warn(
      "[copy-monaco] monaco-editor not installed yet; skipping. Re-run after npm install."
    );
    return;
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await rm(dest, { recursive: true, force: true });
  await cp(src, dest, { recursive: true });
  console.log(`[copy-monaco] copied Monaco to ${path.relative(root, dest)}`);
}

main().catch((err) => {
  console.error("[copy-monaco] failed:", err);
  process.exit(1);
});
