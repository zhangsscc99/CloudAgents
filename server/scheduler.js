import { Cron } from 'croner';
import { db, nowIso } from './db.js';
import { runManager } from './run-manager.js';
import { CRON_PRESETS } from './config.js';

export function validateCron(expression, timezone = 'UTC') {
  const value = String(expression || '').trim();
  if (!value) throw new Error('Cron expression is required');
  try {
    const job = new Cron(value, { timezone, paused: true });
    const next = job.nextRun();
    job.stop();
    if (!next) throw new Error('Cron expression has no future occurrences');
    return next;
  } catch (error) {
    throw new Error(`Invalid cron expression: ${error.message}`);
  }
}

export function nextCronRuns(expression, timezone = 'UTC', count = 5) {
  const job = new Cron(String(expression).trim(), { timezone, paused: true });
  const results = [];
  let cursor = new Date();
  try {
    for (let i = 0; i < count; i += 1) {
      const next = job.nextRun(cursor);
      if (!next) break;
      results.push(next.toISOString());
      cursor = new Date(next.getTime() + 1000);
    }
  } finally {
    job.stop();
  }
  return results;
}

export function describeCron(expression) {
  const trimmed = String(expression || '').trim();
  return CRON_PRESETS[trimmed] || `Custom schedule (${trimmed})`;
}

export function getTriggerNextRun(trigger, from = new Date()) {
  if (!trigger.enabled || trigger.type !== 'cron' || !trigger.expression) return null;
  try {
    const job = new Cron(trigger.expression, { timezone: trigger.timezone || 'UTC', paused: true });
    const next = job.nextRun(from);
    job.stop();
    return next ? next.toISOString() : null;
  } catch {
    return null;
  }
}

export function createSkippedRun(automation, reason, triggerType = 'schedule') {
  const run = runManager.createRun({
    automationId: automation.id,
    automationName: automation.name,
    triggerType,
    repoDir: automation.repo_dir,
    prompt: automation.instructions,
    model: automation.model,
    effort: automation.effort,
    bypassSandbox: true,
    triggerReason: reason,
    tools: automation.tool_push_branch ? ['push_branch'] : [],
  });
  const timestamp = nowIso();
  runManager.appendEvent(run.id, 'run.skipped', { reason });
  runManager.setStatus(run.id, 'skipped', {
    finished_at: timestamp,
    duration_ms: 0,
    error: reason,
  });
  return runManager.getRun(run.id);
}

export function createAutomationRun(automationId, options = {}) {
  const automation = db.prepare('SELECT * FROM automations WHERE id = ?').get(automationId);
  if (!automation) throw new Error('Automation not found');
  const triggerType = options.triggerType || 'manual';

  if (!automation.enabled) {
    return createSkippedRun(automation, 'Automation is disabled', triggerType);
  }

  const activeRun = db.prepare(`
    SELECT id FROM runs
    WHERE automation_id = ? AND status IN ('queued', 'running')
    LIMIT 1
  `).get(automationId);
  if (activeRun) {
    return createSkippedRun(automation, 'A run for this automation is already in progress', triggerType);
  }

  const memoryContext = automation.memories_enabled && automation.memory_notes.trim()
    ? `\n\nPersistent context for this automation:\n${automation.memory_notes.trim()}`
    : '';
  const run = runManager.createRun({
    automationId: automation.id,
    automationName: automation.name,
    triggerType,
    repoDir: automation.repo_dir,
    prompt: `${automation.instructions}${memoryContext}`,
    model: automation.model,
    effort: automation.effort,
    bypassSandbox: true,
    skipGitRepoCheck: false,
    triggerReason: options.reason || null,
    tools: automation.tool_push_branch ? ['push_branch'] : [],
  });

  try {
    runManager.start(run.id);
  } catch (error) {
    runManager.appendEvent(run.id, 'run.error', { message: error.message });
    runManager.setStatus(run.id, 'failed', {
      finished_at: nowIso(),
      error: error.message,
    });
  }
  return runManager.getRun(run.id);
}

export class AutomationScheduler {
  constructor() {
    this.jobs = new Map();
  }

  start() {
    this.reload();
  }

  reload() {
    this.stop();
    const triggers = db.prepare(`
      SELECT t.*
      FROM automation_triggers t
      JOIN automations a ON a.id = t.automation_id
      WHERE t.type = 'cron' AND t.enabled = 1 AND a.enabled = 1
    `).all();

    for (const trigger of triggers) {
      try {
        const job = new Cron(
          trigger.expression,
          { timezone: trigger.timezone || 'UTC', protect: true },
          () => {
            const latest = db.prepare('SELECT * FROM automation_triggers WHERE id = ?').get(trigger.id);
            if (!latest?.enabled) return;
            createAutomationRun(trigger.automation_id, {
              triggerType: 'schedule',
              reason: `${describeCron(trigger.expression)} in ${trigger.timezone}`,
            });
            this.refreshNextRun(trigger.id, job);
          },
        );
        this.jobs.set(trigger.id, job);
        this.refreshNextRun(trigger.id, job);
      } catch (error) {
        console.error(`[scheduler] ${trigger.id}: ${error.message}`);
      }
    }
  }

  refreshNextRun(triggerId, job = this.jobs.get(triggerId)) {
    const next = job?.nextRun();
    db.prepare('UPDATE automation_triggers SET next_run_at = ? WHERE id = ?')
      .run(next ? next.toISOString() : null, triggerId);
  }

  stop() {
    for (const job of this.jobs.values()) job.stop();
    this.jobs.clear();
  }
}

export const scheduler = new AutomationScheduler();
