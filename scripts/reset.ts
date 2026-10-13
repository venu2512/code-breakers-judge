/**
 * Reset contest data without touching teams or problems.
 *
 *   npm run reset
 *
 * Clears: submissions, assignments, autosaved code and the event log, and
 * returns the contest to 'waiting'. Teams and problems are kept.
 */
import { db } from "../lib/db";

db.exec(`
  DELETE FROM submissions;
  DELETE FROM assignments;
  DELETE FROM team_code;
  DELETE FROM events;
  DELETE FROM rounds;
  UPDATE teams SET eligible_round = 99;
  UPDATE contest
     SET state = 'waiting',
         started_at = NULL,
         ends_at = NULL,
         remaining_seconds = NULL,
         current_round = 1,
         lockdown = 0,
         updated_at = ${Date.now()}
   WHERE id = 1;
`);

const counts = {
  teams: (db.prepare("SELECT COUNT(*) c FROM teams").get() as { c: number }).c,
  problems: (db.prepare("SELECT COUNT(*) c FROM problems").get() as { c: number }).c,
};
console.log("Reset complete. Contest is waiting.");
console.log(`  teams kept:    ${counts.teams}`);
console.log(`  problems kept: ${counts.problems}`);
