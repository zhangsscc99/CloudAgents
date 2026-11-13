import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(serverDir, '..');
export const dataDir = resolve(projectRoot, 'data');
export const dbPath = resolve(dataDir, 'cloudagents.db');

mkdirSync(dataDir, { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS automations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    repo_dir TEXT NOT NULL,
    instructions TEXT NOT NULL,
    model TEXT NOT NULL,
    effort TEXT NOT NULL DEFAULT 'medium',
    enabled INTEGER NOT NULL DEFAULT 1,
    tool_push_branch INTEGER NOT NULL DEFAULT 0,
    memories_enabled INTEGER NOT NULL DEFAULT 0,
    memory_notes TEXT NOT NULL DEFAULT '',
    last_run_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS automation_triggers (
    id TEXT PRIMARY KEY,
    automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('cron', 'manual')),
    expression TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    enabled INTEGER NOT NULL DEFAULT 1,
    next_run_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    automation_id TEXT REFERENCES automations(id) ON DELETE SET NULL,
    automation_name TEXT,
    trigger_type TEXT NOT NULL DEFAULT 'manual',
    parent_run_id TEXT,
    repo_dir TEXT NOT NULL,
    prompt TEXT NOT NULL,
    model TEXT NOT NULL,
    effort TEXT NOT NULL,
    bypass_sandbox INTEGER NOT NULL DEFAULT 1,
    skip_git_repo_check INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'queued',
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    session_id TEXT,
    exit_code INTEGER,
    error TEXT,
    tools_used TEXT NOT NULL DEFAULT '[]',
    trigger_reason TEXT,
    last_activity_at TEXT
  );

  CREATE TABLE IF NOT EXISTS run_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(run_id, seq)
  );

  CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
  CREATE INDEX IF NOT EXISTS idx_runs_automation ON runs(automation_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_runs_repo ON runs(repo_dir, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_events_run ON run_events(run_id, seq);
  CREATE INDEX IF NOT EXISTS idx_triggers_automation ON automation_triggers(automation_id);
`);

db.prepare(`
  UPDATE runs
  SET status = 'failed',
      finished_at = COALESCE(finished_at, ?),
      error = COALESCE(error, 'Server restarted while this run was active')
  WHERE status IN ('queued', 'running')
`).run(new Date().toISOString());

export function nowIso() {
  return new Date().toISOString();
}

export function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function rowToAutomation(row, triggers = []) {
  if (!row) return null;
  return {
    ...row,
    enabled: Boolean(row.enabled),
    tool_push_branch: Boolean(row.tool_push_branch),
    memories_enabled: Boolean(row.memories_enabled),
    tools: row.tool_push_branch ? ['push_branch'] : [],
    triggers: triggers.map((trigger) => ({
      ...trigger,
      enabled: Boolean(trigger.enabled),
    })),
  };
}

export function rowToRun(row) {
  if (!row) return null;
  return {
    ...row,
    bypass_sandbox: Boolean(row.bypass_sandbox),
    skip_git_repo_check: Boolean(row.skip_git_repo_check),
    tools_used: parseJson(row.tools_used, []),
  };
}

export function rowToEvent(row) {
  return {
    ...row,
    payload: parseJson(row.payload, {}),
  };
}
