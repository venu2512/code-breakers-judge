import { validateConfig } from "./config";

let validated = false;

export function ensureConfig(): void {
  if (validated) return;
  validateConfig();
  validated = true;
}
