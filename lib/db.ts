import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { ensureConfig } from "./bootstrap";

ensureConfig();

// The database lives at <project>/data/contest.db
export const DATA_DIR = path.join(process.cwd(), "data");
export const DB_PATH = path.join(DATA_DIR, "contest.db");

function createSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contest (
      id                INTEGER PRIMARY KEY CHECK (id = 1),
      state             TEXT    NOT NULL DEFAULT 'waiting',
      duration_seconds  INTEGER NOT NULL DEFAULT 2700,
      started_at        INTEGER,
      ends_at           INTEGER,
      remaining_seconds INTEGER,
      allowed_languages TEXT    NOT NULL DEFAULT 'python,c,cpp,java,javascript',
      current_round     INTEGER NOT NULL DEFAULT 1,
      total_rounds      INTEGER NOT NULL DEFAULT 3,
      updated_at        INTEGER NOT NULL DEFAULT 0
    );

    -- Per-round timing, one row per round that has ever started.
    CREATE TABLE IF NOT EXISTS rounds (
      round_no   INTEGER PRIMARY KEY,
      started_at INTEGER,
      ends_at    INTEGER,
      updated_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS teams (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT    NOT NULL,
      name_norm      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      phone_hash     TEXT    NOT NULL,
      members        TEXT,
      -- Highest round this team may take part in. Set when shortlisting.
      eligible_round INTEGER NOT NULL DEFAULT 99,
      created_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS problems (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      code          TEXT    NOT NULL UNIQUE,
      title         TEXT    NOT NULL,
      statement     TEXT    NOT NULL,
      pattern       TEXT,
      time_limit_ms INTEGER NOT NULL DEFAULT 2000,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_cases (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
      input      TEXT    NOT NULL,
      expected   TEXT    NOT NULL,
      is_sample  INTEGER NOT NULL DEFAULT 0,
      ordinal    INTEGER NOT NULL DEFAULT 0
    );

    -- team_id is the primary key: one problem per team, enforced by the DB.
    CREATE TABLE IF NOT EXISTS assignments (
      team_id     INTEGER PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
      problem_id  INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
      assigned_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id     INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      problem_id  INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
      round       INTEGER NOT NULL DEFAULT 1,
      language    TEXT    NOT NULL,
      code        TEXT    NOT NULL,
      status      TEXT    NOT NULL DEFAULT 'INTERNAL_ERROR',
      passed      INTEGER NOT NULL DEFAULT 0,
      total       INTEGER NOT NULL DEFAULT 0,
      results     TEXT    NOT NULL DEFAULT '[]',
      is_best     INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      judged_at   INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_tests_problem  ON test_cases(problem_id, is_sample);
    CREATE INDEX IF NOT EXISTS idx_subs_team      ON submissions(team_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_subs_problem   ON submissions(problem_id);

    -- Simple audit log for admin actions and events.
    CREATE TABLE IF NOT EXISTS events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      at         INTEGER NOT NULL,
      kind       TEXT    NOT NULL,
      team_id    INTEGER,
      detail     TEXT,
      ip_address TEXT,
      user_agent TEXT
    );

    -- Autosaved code per team and language so a refresh loses nothing.
    CREATE TABLE IF NOT EXISTS team_code (
      team_id    INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      language   TEXT    NOT NULL,
      code       TEXT    NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (team_id, language)
    );

    CREATE INDEX IF NOT EXISTS idx_subs_team_judged ON submissions(team_id, judged_at);
  `);

  // Lightweight migrations for existing DBs
  try {
    db.prepare("ALTER TABLE events ADD COLUMN ip_address TEXT").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE events ADD COLUMN user_agent TEXT").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE contest ADD COLUMN lockdown INTEGER NOT NULL DEFAULT 0").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE contest ADD COLUMN current_round INTEGER NOT NULL DEFAULT 1").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE contest ADD COLUMN total_rounds INTEGER NOT NULL DEFAULT 3").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE teams ADD COLUMN eligible_round INTEGER NOT NULL DEFAULT 99").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE submissions ADD COLUMN round INTEGER NOT NULL DEFAULT 1").run();
  } catch {}
  try {
    db.prepare("CREATE INDEX IF NOT EXISTS idx_subs_round ON submissions(round, team_id)").run();
  } catch {}

  // Make sure the single contest row exists.
  const row = db.prepare("SELECT id FROM contest WHERE id = 1").get();
  if (!row) {
    db.prepare(
      `INSERT INTO contest
         (id, state, duration_seconds, allowed_languages, updated_at, lockdown, current_round, total_rounds)
       VALUES (1, 'waiting', ?, ?, ?, 0, 1, ?)`
    ).run(
      config.defaultDurationMinutes * 60,
      config.allowedLanguages.join(","),
      Date.now(),
      config.totalRounds
    );
  }
}

// Next.js dev mode re-evaluates modules on hot reload. Cache the connection
// on globalThis so we never open the same SQLite file multiple times.
const globalForDb = globalThis as unknown as { __cbDb?: Database.Database };

function getDb(): Database.Database {
  if (globalForDb.__cbDb) return globalForDb.__cbDb;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  createSchema(db);

  globalForDb.__cbDb = db;
  return db;
}

export const db = getDb();
export default db;
