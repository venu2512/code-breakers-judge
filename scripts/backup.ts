/**
 * Snapshot the live database into data/backups/.
 *
 *   npm run backup
 *
 * Run before each round and at the end of the event. Uses SQLite's online
 * backup API, so it is safe while the server is running.
 */
import fs from "fs";
import path from "path";
import { db } from "../lib/db";

const outDir = path.join(__dirname, "..", "data", "backups");
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dest = path.join(outDir, `contest-${stamp}.db`);

db.backup(dest);
console.log(`Backup written: ${dest}`);