import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { db, nowIso, parseJson, rowToEvent, rowToRun } from './db.js';
import { DEFAULT_EFFORT, DEFAULT_MODEL, NODE_BIN } from './config.js';

export class RunEventBus {
  constructor() {
    this.clients = new Map();
  }

  subscribe(runId, response) {
    if (!this.clients.has(runId)) this.clients.set(runId, new Set());
    this.clients.get(runId).add(response);
    return () => {
      const listeners = this.clients.get(runId);
      if (!listeners) return;
      listeners.delete(response);
      if (listeners.size === 0) this.clients.delete(runId);
    };
  }

  publish(runId, eventName, data) {
    const payload = JSON.stringify(data);
    for (const response of this.clients.get(runId) || []) {
      try {
        response.write(`event: ${eventName}\ndata: ${payload}\n\n`);
      } catch {
        this.clients.get(runId)?.delete(response);
      }
    }
  }
}

export class RunManager {
  constructor(database = db, bus = new RunEventBus()) {
    this.db = database;
    this.bus = bus;
    this.active = new Map();
    this.insertEventStatement = db.prepare(`
      INSERT INTO run_events (run_id, seq, type, payload, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    this.nextSeqStatement = db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM run_events WHERE run_id = ?');
  }

  createRun(input) {
    const id = randomUUID();
    const createdAt = nowIso();
    const model = input.model || DEFAULT_MODEL;
    const effort = input.effort || DEFAULT_EFFORT;
    const bypassSandbox = input.bypassSandbox !== false;
    const skipGitRepoCheck = Boolean(input.skipGitRepoCheck);
    const tools = Array.isArray(input.tools) ? input.tools : [];

    this.db.prepare(`
      INSERT INTO runs (
        id, automation_id, automation_name, trigger_type, parent_run_id,
        repo_dir, prompt, model, effort, bypass_sandbox, skip_git_repo_check,
        status, created_at, tools_used, trigger_reason, last_activity_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.automationId || null,
      input.automationName || null,
      input.triggerType || 'manual',
      input.parentRunId || null,
      input.repoDir,
      input.prompt,
      model,
      effort,
      bypassSandbox ? 1 : 0,
      skipGitRepoCheck ? 1 : 0,
      'queued',
      createdAt,
      JSON.stringify(tools),
      input.triggerReason || null,
      createdAt,
    );

    this.appendEvent(id, 'user.prompt', { prompt: input.prompt, trigger: input.triggerType || 'manual' });
    return this.getRun(id);
  }

  getRun(id) {
    return rowToRun(this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id));
  }

  getEvents(id, after = 0) {
    return this.db
      .prepare('SELECT * FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC')
      .all(id, Number(after) || 0)
      .map(rowToEvent);
  }

  appendEvent(runId, type, payload = {}) {
    const seq = this.nextSeqStatement.get(runId).seq;
    const createdAt = nowIso();
    this.insertEventStatement.run(runId, seq, type || 'codex.event', JSON.stringify(payload), createdAt);
    this.db.prepare('UPDATE runs SET last_activity_at = ? WHERE id = ?').run(createdAt, runId);
    const event = { id: seq, run_id: runId, seq, type: type || 'codex.event', payload, created_at: createdAt };
    this.bus.publish(runId, 'run-event', event);
    return event;
  }

  publishStatus(runId) {
    const run = this.getRun(runId);
    if (run) this.bus.publish(runId, 'run-status', run);
    return run;
  }

  setStatus(runId, status, patch = {}) {
    const fields = ['status = ?'];
    const values = [status];
    for (const [key, value] of Object.entries(patch)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
    values.push(runId);
    this.db.prepare(`UPDATE runs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.publishStatus(runId);
  }

  start(runId) {
    if (this.active.has(runId)) {
      throw new Error('Run is already active');
    }
    const run = this.getRun(runId);
    if (!run) throw new Error('Run not found');

    const startedAtMs = Date.now();
    this.setStatus(runId, 'running', { started_at: new Date(startedAtMs).toISOString(), finished_at: null, error: null });

    const state = {
      child: null,
      stopRequested: false,
      finalizing: false,
      startedAtMs,
      baseDurationMs: run.duration_ms || 0,
      sessionId: run.session_id,
      resume: false,
    };
    this.active.set(runId, state);
    this.launch(run, run.prompt, state);
    return this.publishStatus(runId);
  }

  resume(runId, prompt) {
    if (this.active.has(runId)) {
      throw new Error('Run is still active');
    }
    const run = this.getRun(runId);
    if (!run) throw new Error('Run not found');
    if (!run.session_id) throw new Error('No Codex session is available for this run');

    const startedAtMs = Date.now();
    this.setStatus(runId, 'running', {
      started_at: new Date(startedAtMs).toISOString(),
      finished_at: null,
      error: null,
    });
    this.appendEvent(runId, 'user.followup', { prompt });

    const state = {
      child: null,
      stopRequested: false,
      finalizing: false,
      startedAtMs,
      baseDurationMs: run.duration_ms || 0,
      sessionId: run.session_id,
      resume: true,
    };
    this.active.set(runId, state);
    this.launch(run, prompt, state);
    return this.publishStatus(runId);
  }

  buildArgs(run, prompt, state) {
    const args = ['exec'];
    if (state.resume) {
      args.push('--json');
      if (run.bypass_sandbox) args.push('--dangerously-bypass-approvals-and-sandbox');
      if (run.skip_git_repo_check) args.push('--skip-git-repo-check');
      args.push('-C', run.repo_dir, '-m', run.model, '-c', `model_reasoning_effort=${run.effort}`);
      args.push('resume', state.sessionId, prompt);
      return args;
    }

    args.push('--json');
    if (run.bypass_sandbox) args.push('--dangerously-bypass-approvals-and-sandbox');
    if (run.skip_git_repo_check) args.push('--skip-git-repo-check');
    args.push('-C', run.repo_dir, '-m', run.model, '-c', `model_reasoning_effort=${run.effort}`, prompt);
    return args;
  }

  launch(run, prompt, state) {
    const args = this.buildArgs(run, prompt, state);
    this.appendEvent(run.id, 'run.started', {
      command: 'codex',
      args: args.map((arg, index) => (index === args.length - 1 ? '[prompt]' : arg)),
      resumed: state.resume,
    });

    const child = spawn('codex', args, {
      cwd: run.repo_dir,
      env: {
        ...process.env,
        PATH: `${NODE_BIN}:${process.env.PATH || ''}`,
        NO_COLOR: '1',
        GIT_TERMINAL_PROMPT: '0',
      },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    state.child = child;

    let stdoutBuffer = '';
    let stderrBuffer = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk;
      let newline;
      while ((newline = stdoutBuffer.indexOf('\n')) !== -1) {
        const line = stdoutBuffer.slice(0, newline).trim();
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        if (line) this.handleStdoutLine(run.id, line, state);
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrBuffer += chunk;
      let newline;
      while ((newline = stderrBuffer.indexOf('\n')) !== -1) {
        const line = stderrBuffer.slice(0, newline).trimEnd();
        stderrBuffer = stderrBuffer.slice(newline + 1);
        if (line) this.appendEvent(run.id, 'codex.stderr', { message: line });
      }
    });

    child.on('error', (error) => {
      this.finalize(run.id, state, null, error);
    });

    child.on('close', (code, signal) => {
      if (stdoutBuffer.trim()) this.handleStdoutLine(run.id, stdoutBuffer.trim(), state);
      if (stderrBuffer.trim()) this.appendEvent(run.id, 'codex.stderr', { message: stderrBuffer.trim() });
      this.finalize(run.id, state, code, null, signal);
    });
  }

  handleStdoutLine(runId, line, state) {
    try {
      const payload = JSON.parse(line);
      const sessionId = findSessionId(payload);
      if (sessionId && sessionId !== state.sessionId) {
        state.sessionId = sessionId;
        this.db.prepare('UPDATE runs SET session_id = ? WHERE id = ?').run(sessionId, runId);
        this.publishStatus(runId);
      }
      this.appendEvent(runId, payload.type || payload.msg?.type || 'codex.event', payload);
    } catch {
      this.appendEvent(runId, 'codex.stdout', { message: line });
    }
  }

  async finalize(runId, state, exitCode, spawnError = null, signal = null) {
    if (state.finalizing) return;
    state.finalizing = true;
    const run = this.getRun(runId);
    if (!run) {
      this.active.delete(runId);
      return;
    }

    let status;
    let error = null;
    if (state.stopRequested) {
      status = 'stopped';
      error = 'Stopped by user';
    } else if (spawnError) {
      status = 'failed';
      error = spawnError.message;
    } else if (exitCode === 0) {
      status = 'succeeded';
    } else {
      status = 'failed';
      error = signal ? `Codex exited after ${signal}` : `Codex exited with code ${exitCode}`;
    }

    if (status === 'succeeded' && run.automation_id && run.tools_used.includes('push_branch')) {
      this.appendEvent(runId, 'tool.started', { tool: 'push_branch', label: 'Push branch to origin' });
      const push = await runGitPush(run.repo_dir).catch((pushError) => ({ code: 1, output: pushError.message }));
      this.appendEvent(runId, 'tool.completed', {
        tool: 'push_branch',
        code: push.code,
        output: push.output,
      });
      if (push.code !== 0) {
        status = 'failed';
        error = 'Post-run git push failed';
      }
    }

    const finishedAt = new Date().toISOString();
    const durationMs = state.baseDurationMs + (Date.now() - state.startedAtMs);
    this.appendEvent(runId, 'run.completed', { status, exitCode, signal, durationMs, error });
    this.setStatus(runId, status, {
      finished_at: finishedAt,
      duration_ms: durationMs,
      exit_code: exitCode,
      error,
    });
    if (run.automation_id) {
      this.db.prepare('UPDATE automations SET last_run_at = ? WHERE id = ?').run(finishedAt, run.automation_id);
    }
    this.active.delete(runId);
  }

  stop(runId) {
    const state = this.active.get(runId);
    if (!state) return false;
    state.stopRequested = true;
    this.appendEvent(runId, 'run.stopping', { message: 'Stop requested' });
    killTree(state.child, 'SIGTERM');
    const timer = setTimeout(() => {
      if (this.active.get(runId) === state) killTree(state.child, 'SIGKILL');
    }, 3000);
    timer.unref();
    return true;
  }
}

function findSessionId(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 6) return null;
  for (const key of ['session_id', 'thread_id', 'conversation_id']) {
    if (typeof value[key] === 'string' && value[key]) return value[key];
  }
  for (const child of Object.values(value)) {
    const found = findSessionId(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function killTree(child, signal) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The process has already exited.
    }
  }
}

function runGitPush(cwd) {
  return new Promise((resolve) => {
    const child = spawn('git', ['push'], {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', NO_COLOR: '1' },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    const timeout = setTimeout(() => killTree(child, 'SIGKILL'), 30000);
    child.on('error', (error) => {
      clearTimeout(timeout);
      resolve({ code: 1, output: error.message });
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ code: code ?? 1, output: output.slice(-12000) });
    });
  });
}

export const runBus = new RunEventBus();
export const runManager = new RunManager(db, runBus);

export function parseRunEventPayload(event) {
  return typeof event.payload === 'string' ? parseJson(event.payload, {}) : event.payload;
}
