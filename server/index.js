import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, nowIso, projectRoot, rowToAutomation, rowToRun } from './db.js';
import {
  CRON_PRESETS,
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  EFFORTS,
  HOST,
  MODELS,
  PORT,
  TIMEZONES,
} from './config.js';
import { discoverRepos, validateRepo } from './repos.js';
import { runBus, runManager } from './run-manager.js';
import {
  createAutomationRun,
  describeCron,
  getTriggerNextRun,
  nextCronRuns,
  scheduler,
  validateCron,
} from './scheduler.js';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'production' ? undefined : {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  },
  bodyLimit: 2 * 1024 * 1024,
});

const serverDir = dirname(fileURLToPath(import.meta.url));
const webDist = resolve(serverDir, '../web/dist');

function apiError(reply, status, message) {
  return reply.code(status).send({ error: message });
}

function cleanText(value, field, maxLength = 100_000) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  if (value.length > maxLength) throw new Error(`${field} is too long`);
  return value.trim();
}

function cleanModel(value) {
  return cleanText(value || DEFAULT_MODEL, 'Model', 120);
}

function cleanEffort(value) {
  const effort = value || DEFAULT_EFFORT;
  if (!EFFORTS.includes(effort)) throw new Error('Invalid reasoning effort');
  return effort;
}

function cleanTimezone(value) {
  const timezone = value || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new Error('Invalid timezone');
  }
  return timezone;
}

function getGitUser() {
  try {
    return execFileSync('git', ['config', 'user.name'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || 'Local user';
  } catch {
    return 'Local user';
  }
}

function getAutomation(id) {
  const row = db.prepare('SELECT * FROM automations WHERE id = ?').get(id);
  if (!row) return null;
  const triggers = db.prepare('SELECT * FROM automation_triggers WHERE automation_id = ? ORDER BY created_at').all(id);
  const automation = rowToAutomation(row, triggers);
  automation.triggers = automation.triggers.map((trigger) => ({
    ...trigger,
    description: trigger.type === 'cron' ? describeCron(trigger.expression) : 'Manual only',
    next_run_at: trigger.type === 'cron' ? getTriggerNextRun(trigger) : null,
  }));
  automation.next_run_at = automation.triggers
    .map((trigger) => trigger.next_run_at)
    .filter(Boolean)
    .sort()[0] || null;
  automation.stats = getAutomationStats(id);
  return automation;
}

function getAutomationStats(id) {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'succeeded' AND created_at >= ? THEN 1 ELSE 0 END) AS successful_24h,
      SUM(CASE WHEN status = 'failed' AND created_at >= ? THEN 1 ELSE 0 END) AS failed_24h,
      SUM(CASE WHEN status = 'succeeded' AND created_at >= ? THEN 1 ELSE 0 END) AS successful_7d,
      SUM(CASE WHEN status = 'failed' AND created_at >= ? THEN 1 ELSE 0 END) AS failed_7d,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
      COUNT(*) AS total
    FROM runs WHERE automation_id = ?
  `).get(dayAgo, dayAgo, weekAgo, weekAgo, id);
  return Object.fromEntries(Object.entries(rows).map(([key, value]) => [key, Number(value || 0)]));
}

function normalizeAutomationInput(body, existing = null) {
  const name = cleanText(body.name, 'Name', 160);
  const repoDir = cleanText(body.repoDir || body.repo_dir, 'Repository', 1000);
  const instructions = cleanText(body.instructions, 'Instructions', 120_000);
  const model = cleanModel(body.model);
  const effort = cleanEffort(body.effort);
  const enabled = body.enabled === undefined ? true : Boolean(body.enabled);
  const toolPushBranch = Boolean(body.tool_push_branch ?? body.tools?.includes?.('push_branch'));
  const memoriesEnabled = Boolean(body.memories_enabled ?? body.memoriesEnabled);
  const memoryNotes = typeof body.memory_notes === 'string'
    ? body.memory_notes.slice(0, 50_000)
    : (typeof body.memoryNotes === 'string' ? body.memoryNotes.slice(0, 50_000) : '');
  const incomingTriggers = Array.isArray(body.triggers) ? body.triggers : [];
  if (incomingTriggers.length === 0) throw new Error('Add at least one trigger');

  const triggers = incomingTriggers.map((trigger) => {
    const type = trigger.type === 'manual' ? 'manual' : 'cron';
    const timezone = cleanTimezone(trigger.timezone);
    const triggerEnabled = trigger.enabled === undefined ? true : Boolean(trigger.enabled);
    if (type === 'manual') {
      return { id: trigger.id || randomUUID(), type, expression: null, timezone, enabled: triggerEnabled };
    }
    const expression = cleanText(trigger.expression, 'Cron expression', 200);
    validateCron(expression, timezone);
    return { id: trigger.id || randomUUID(), type, expression, timezone, enabled: triggerEnabled };
  });

  return {
    name,
    repoDir,
    instructions,
    model,
    effort,
    enabled,
    toolPushBranch,
    memoriesEnabled,
    memoryNotes,
    triggers,
    existing,
  };
}

function insertTriggers(automationId, triggers) {
  const statement = db.prepare(`
    INSERT INTO automation_triggers (
      id, automation_id, type, expression, timezone, enabled, next_run_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const timestamp = nowIso();
  for (const trigger of triggers) {
    statement.run(
      trigger.id,
      automationId,
      trigger.type,
      trigger.expression,
      trigger.timezone,
      trigger.enabled ? 1 : 0,
      null,
      timestamp,
      timestamp,
    );
  }
}

app.get('/api/health', async () => ({
  ok: true,
  service: 'cloudagents',
  time: nowIso(),
  activeRuns: runManager.active.size,
}));

app.get('/api/config', async () => ({
  models: MODELS,
  efforts: EFFORTS,
  defaults: { model: DEFAULT_MODEL, effort: DEFAULT_EFFORT },
  timezones: TIMEZONES,
  cronPresets: CRON_PRESETS,
  gitUser: getGitUser(),
  runtime: { node: process.versions.node, sqlite: 'sqlite' },
  nodePath: '/root/.nvm/versions/node/v24.5.0/bin',
}));

app.get('/api/repos', async () => ({ repos: await discoverRepos() }));

app.get('/api/agents', async () => {
  const repos = await discoverRepos();
  const runStats = db.prepare(`
    SELECT repo_dir, COUNT(*) AS total,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
      MAX(created_at) AS last_run_at
    FROM runs GROUP BY repo_dir
  `).all();
  const statsByRepo = new Map(runStats.map((row) => [row.repo_dir, row]));
  const recentRuns = db.prepare('SELECT * FROM runs ORDER BY created_at DESC LIMIT 12').all().map(rowToRun);
  const counts = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
      SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
    FROM runs
  `).get();
  return {
    repos: repos.map((repo) => ({
      ...repo,
      runCount: Number(statsByRepo.get(repo.path)?.total || 0),
      runningCount: Number(statsByRepo.get(repo.path)?.running || 0),
      lastRunAt: statsByRepo.get(repo.path)?.last_run_at || null,
    })),
    recentRuns,
    counts: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value || 0)])),
    automationCount: Number(db.prepare('SELECT COUNT(*) AS count FROM automations').get().count),
  };
});

app.get('/api/cron/preview', async (request, reply) => {
  try {
    const expression = cleanText(request.query.expression, 'Cron expression', 200);
    const timezone = cleanTimezone(request.query.timezone);
    const runs = nextCronRuns(expression, timezone, 5);
    return {
      valid: true,
      description: describeCron(expression),
      nextRunAt: runs[0] || null,
      nextRuns: runs,
    };
  } catch (error) {
    return reply.code(400).send({ valid: false, error: error.message });
  }
});

app.get('/api/runs', async (request) => {
  const { status, q, automation_id: automationId, repo_dir: repoDir } = request.query;
  const conditions = [];
  const params = [];
  if (status && status !== 'all') {
    conditions.push('status = ?');
    params.push(status);
  }
  if (automationId) {
    conditions.push('automation_id = ?');
    params.push(automationId);
  }
  if (repoDir) {
    conditions.push('repo_dir = ?');
    params.push(repoDir);
  }
  if (q) {
    conditions.push('(COALESCE(automation_name, \'Manual\') LIKE ? OR repo_dir LIKE ? OR prompt LIKE ?)');
    const term = `%${q}%`;
    params.push(term, term, term);
  }
  const limit = Math.min(Math.max(Number(request.query.limit) || 100, 1), 250);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM runs ${where} ORDER BY created_at DESC LIMIT ?`).all(...params, limit);
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'succeeded' AND created_at >= ? THEN 1 ELSE 0 END) AS successful_24h,
      SUM(CASE WHEN status = 'failed' AND created_at >= ? THEN 1 ELSE 0 END) AS failed_24h,
      SUM(CASE WHEN status = 'succeeded' AND created_at >= ? THEN 1 ELSE 0 END) AS successful_7d,
      SUM(CASE WHEN status = 'failed' AND created_at >= ? THEN 1 ELSE 0 END) AS failed_7d
    FROM runs
  `).get(dayAgo, dayAgo, weekAgo, weekAgo);
  return {
    runs: rows.map(rowToRun),
    stats: Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, Number(value || 0)])),
  };
});

app.post('/api/runs', async (request, reply) => {
  try {
    const body = request.body || {};
    const repoDir = await validateRepo(cleanText(body.repoDir || body.repo_dir, 'Repository', 1000));
    const prompt = cleanText(body.prompt, 'Prompt', 120_000);
    const run = runManager.createRun({
      repoDir,
      prompt,
      model: cleanModel(body.model),
      effort: cleanEffort(body.effort),
      bypassSandbox: body.bypassSandbox !== false,
      skipGitRepoCheck: Boolean(body.skipGitRepoCheck),
      triggerType: 'manual',
    });
    setImmediate(() => {
      try {
        runManager.start(run.id);
      } catch (error) {
        runManager.setStatus(run.id, 'failed', { finished_at: nowIso(), error: error.message });
      }
    });
    return reply.code(202).send({ run: runManager.getRun(run.id) });
  } catch (error) {
    return apiError(reply, 400, error.message);
  }
});

app.get('/api/runs/:id', async (request, reply) => {
  const run = runManager.getRun(request.params.id);
  if (!run) return apiError(reply, 404, 'Run not found');
  return { run };
});

app.get('/api/runs/:id/events', async (request, reply) => {
  const run = runManager.getRun(request.params.id);
  if (!run) return apiError(reply, 404, 'Run not found');
  return { events: runManager.getEvents(request.params.id, Number(request.query.after || 0)) };
});

app.get('/api/runs/:id/events/stream', async (request, reply) => {
  const run = runManager.getRun(request.params.id);
  if (!run) return apiError(reply, 404, 'Run not found');

  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  reply.raw.flushHeaders?.();

  const unsubscribe = runBus.subscribe(request.params.id, reply.raw);
  for (const event of runManager.getEvents(request.params.id, Number(request.query.after || 0))) {
    reply.raw.write(`event: run-event\ndata: ${JSON.stringify(event)}\n\n`);
  }
  reply.raw.write(`event: run-status\ndata: ${JSON.stringify(run)}\n\n`);
  reply.raw.write('event: ready\ndata: {}\n\n');

  const heartbeat = setInterval(() => {
    try {
      reply.raw.write(': keepalive\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);
  heartbeat.unref();
  request.raw.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

app.post('/api/runs/:id/follow-up', async (request, reply) => {
  try {
    const run = runManager.getRun(request.params.id);
    if (!run) return apiError(reply, 404, 'Run not found');
    if (run.status === 'running' || run.status === 'queued') {
      return apiError(reply, 409, 'Run is still active');
    }
    if (!run.session_id) return apiError(reply, 409, 'No Codex session was captured for this run');
    const prompt = cleanText(request.body?.prompt, 'Follow-up prompt', 120_000);
    runManager.resume(run.id, prompt);
    return reply.code(202).send({ run: runManager.getRun(run.id) });
  } catch (error) {
    return apiError(reply, 400, error.message);
  }
});

app.post('/api/runs/:id/stop', async (request, reply) => {
  const stopped = runManager.stop(request.params.id);
  if (!stopped) return apiError(reply, 409, 'Run is not active');
  return reply.code(202).send({ ok: true });
});

app.get('/api/automations', async () => {
  const ids = db.prepare('SELECT id FROM automations ORDER BY created_at DESC').all();
  return { automations: ids.map(({ id }) => getAutomation(id)) };
});

app.post('/api/automations', async (request, reply) => {
  try {
    const input = normalizeAutomationInput(request.body || {});
    input.repoDir = await validateRepo(input.repoDir);
    const id = randomUUID();
    const timestamp = nowIso();
    db.transaction(() => {
      db.prepare(`
        INSERT INTO automations (
          id, name, repo_dir, instructions, model, effort, enabled,
          tool_push_branch, memories_enabled, memory_notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.name,
        input.repoDir,
        input.instructions,
        input.model,
        input.effort,
        input.enabled ? 1 : 0,
        input.toolPushBranch ? 1 : 0,
        input.memoriesEnabled ? 1 : 0,
        input.memoryNotes,
        timestamp,
        timestamp,
      );
      insertTriggers(id, input.triggers);
    })();
    scheduler.reload();
    return reply.code(201).send({ automation: getAutomation(id) });
  } catch (error) {
    return apiError(reply, 400, error.message);
  }
});

app.get('/api/automations/:id', async (request, reply) => {
  const automation = getAutomation(request.params.id);
  if (!automation) return apiError(reply, 404, 'Automation not found');
  return { automation };
});

app.put('/api/automations/:id', async (request, reply) => {
  try {
    const existing = db.prepare('SELECT * FROM automations WHERE id = ?').get(request.params.id);
    if (!existing) return apiError(reply, 404, 'Automation not found');
    const input = normalizeAutomationInput(request.body || {}, existing);
    input.repoDir = await validateRepo(input.repoDir);
    const timestamp = nowIso();
    db.transaction(() => {
      db.prepare(`
        UPDATE automations SET
          name = ?, repo_dir = ?, instructions = ?, model = ?, effort = ?, enabled = ?,
          tool_push_branch = ?, memories_enabled = ?, memory_notes = ?, updated_at = ?
        WHERE id = ?
      `).run(
        input.name,
        input.repoDir,
        input.instructions,
        input.model,
        input.effort,
        input.enabled ? 1 : 0,
        input.toolPushBranch ? 1 : 0,
        input.memoriesEnabled ? 1 : 0,
        input.memoryNotes,
        timestamp,
        request.params.id,
      );
      db.prepare('DELETE FROM automation_triggers WHERE automation_id = ?').run(request.params.id);
      insertTriggers(request.params.id, input.triggers);
    })();
    scheduler.reload();
    return { automation: getAutomation(request.params.id) };
  } catch (error) {
    return apiError(reply, 400, error.message);
  }
});

app.delete('/api/automations/:id', async (request, reply) => {
  const result = db.prepare('DELETE FROM automations WHERE id = ?').run(request.params.id);
  if (!result.changes) return apiError(reply, 404, 'Automation not found');
  scheduler.reload();
  return { ok: true };
});

app.post('/api/automations/:id/run', async (request, reply) => {
  try {
    const run = createAutomationRun(request.params.id, {
      triggerType: 'manual',
      reason: 'Started manually from CloudAgents',
    });
    return reply.code(202).send({ run });
  } catch (error) {
    return apiError(reply, 400, error.message);
  }
});

app.get('/api/automations/:id/runs', async (request, reply) => {
  if (!db.prepare('SELECT 1 FROM automations WHERE id = ?').get(request.params.id)) {
    return apiError(reply, 404, 'Automation not found');
  }
  const rows = db.prepare(`
    SELECT * FROM runs WHERE automation_id = ? ORDER BY created_at DESC LIMIT 100
  `).all(request.params.id);
  return { runs: rows.map(rowToRun), stats: getAutomationStats(request.params.id) };
});

app.get('/api/overview', async () => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total_runs,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
      SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
    FROM runs
  `).get();
  const automations = db.prepare('SELECT COUNT(*) AS total, SUM(enabled) AS enabled FROM automations').get();
  return {
    runs: Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, Number(value || 0)])),
    automations: Object.fromEntries(Object.entries(automations).map(([key, value]) => [key, Number(value || 0)])),
  };
});

app.setNotFoundHandler((request, reply) => {
  if (request.method === 'GET' && !request.url.startsWith('/api/') && existsSync(join(webDist, 'index.html'))) {
    return reply.sendFile('index.html');
  }
  return reply.code(404).send({ error: 'Not found' });
});

if (existsSync(webDist)) {
  await app.register(fastifyStatic, {
    root: webDist,
    prefix: '/',
    decorateReply: true,
    wildcard: false,
  });
}

scheduler.start();

const shutdown = async () => {
  scheduler.stop();
  for (const runId of runManager.active.keys()) runManager.stop(runId);
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`CloudAgents listening on http://${HOST}:${PORT}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
