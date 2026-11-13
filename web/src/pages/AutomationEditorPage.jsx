import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  Code2,
  Copy,
  FolderGit2,
  GitBranch,
  History,
  LoaderCircle,
  MemoryStick,
  MoreHorizontal,
  Play,
  Plus,
  Save,
  Sparkles,
  Trash2,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '../api.js';
import { useRemote } from '../hooks.js';
import { formatDate, formatDuration, formatRelative, repoName, uid } from '../utils.js';
import {
  ErrorState,
  Loading,
  RepoDirectoryField,
  StatusBadge,
  Toggle,
} from '../components/Common.jsx';

const SCHEDULE_TYPES = [
  { value: 'custom', label: 'Custom schedule' },
  { value: 'minutes', label: 'Every N minutes' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const WEEKDAYS = [
  ['1', 'Monday'],
  ['2', 'Tuesday'],
  ['3', 'Wednesday'],
  ['4', 'Thursday'],
  ['5', 'Friday'],
  ['6', 'Saturday'],
  ['0', 'Sunday'],
];

const emptyStats = {
  successful_24h: 0,
  failed_24h: 0,
  successful_7d: 0,
  failed_7d: 0,
  total: 0,
};

function inferScheduleType(expression) {
  const value = String(expression || '').trim();
  if (!value) return 'custom';
  if (/^\*\/\d+ \* \* \* \*$/.test(value)) return 'minutes';
  if (value === '0 * * * *') return 'hourly';
  if (/^\d+ \d+ \* \* \*$/.test(value)) return 'daily';
  if (/^\d+ \d+ \* \* [0-6]$/.test(value)) return 'weekly';
  if (/^\d+ \d+ 1 \* \*$/.test(value)) return 'monthly';
  return 'custom';
}

function triggerFromSaved(trigger) {
  return {
    id: trigger.id,
    type: trigger.type,
    expression: trigger.expression || '',
    timezone: trigger.timezone || 'UTC',
    enabled: trigger.enabled,
    schedule_type: trigger.type === 'manual' ? 'manual' : inferScheduleType(trigger.expression),
  };
}

function newTrigger(timezone) {
  return {
    id: uid(),
    type: 'cron',
    expression: '0 9 * * *',
    timezone,
    enabled: true,
    schedule_type: 'daily',
  };
}

function timeFromExpression(expression, fallback = '09:00') {
  const parts = String(expression || '').trim().split(/\s+/);
  if (parts.length !== 5) return fallback;
  const minute = Number(parts[0]);
  const hour = Number(parts[1]);
  if (!Number.isInteger(minute) || !Number.isInteger(hour)) return fallback;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function weekdayFromExpression(expression) {
  const parts = String(expression || '').trim().split(/\s+/);
  return parts.length === 5 && /^[0-6]$/.test(parts[4]) ? parts[4] : '1';
}

function timedExpression(kind, time, weekday = '1') {
  const [hour, minute] = time.split(':').map(Number);
  if (kind === 'hourly') return '0 * * * *';
  if (kind === 'weekly') return `${minute} ${hour} * * ${weekday}`;
  if (kind === 'monthly') return `${minute} ${hour} 1 * *`;
  return `${minute} ${hour} * * *`;
}

function CronPreview({ trigger }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (trigger.type !== 'cron' || !trigger.expression) {
      setPreview(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          expression: trigger.expression,
          timezone: trigger.timezone || 'UTC',
        });
        const result = await api.get(`/api/cron/preview?${params}`);
        if (!cancelled) setPreview(result);
      } catch (previewError) {
        if (!cancelled) setPreview({ valid: false, error: previewError.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trigger.type, trigger.expression, trigger.timezone]);

  if (trigger.type === 'manual') {
    return (
      <div className="cron-preview">
        <span className="cron-preview-icon"><Play size={14} /></span>
        <div><strong>On demand</strong><small>Run with Test or the automation API.</small></div>
      </div>
    );
  }

  return (
    <div className={`cron-preview ${preview?.valid === false ? 'invalid' : ''}`}>
      <span className="cron-preview-icon">
        {loading
          ? <LoaderCircle size={14} className="spin" />
          : preview?.valid === false
            ? <XCircle size={14} />
            : <CalendarClock size={14} />}
      </span>
      <div>
        <strong>{preview?.valid === false ? preview.error : preview?.description || 'Checking schedule…'}</strong>
        {preview?.nextRunAt && (
          <small>
            Next run <time dateTime={preview.nextRunAt}>{formatDate(preview.nextRunAt, { weekday: 'short' })}</time>
            <span> · {formatRelative(preview.nextRunAt)}</span>
          </small>
        )}
      </div>
    </div>
  );
}

function TriggerRow({ trigger, index, onChange, onRemove }) {
  const scheduleType = trigger.schedule_type === 'manual'
    ? 'manual'
    : inferScheduleType(trigger.expression);
  const scheduleTime = timeFromExpression(trigger.expression);
  const weekday = weekdayFromExpression(trigger.expression);
  const minuteCount = String(trigger.expression || '').match(/^\*\/(\d+) \* \* \* \*$/)?.[1] || '10';

  function patch(values) {
    onChange(index, { ...trigger, ...values });
  }

  function changeScheduleType(value) {
    if (value === 'manual') {
      patch({ type: 'manual', schedule_type: value, expression: '' });
      return;
    }
    let expression = trigger.expression || '0 9 * * *';
    if (value === 'minutes') expression = `*/${minuteCount} * * * *`;
    if (value === 'hourly') expression = '0 * * * *';
    if (value === 'daily') expression = timedExpression('daily', scheduleTime);
    if (value === 'weekly') expression = timedExpression('weekly', scheduleTime, weekday);
    if (value === 'monthly') expression = timedExpression('monthly', scheduleTime);
    patch({ type: 'cron', schedule_type: value, expression });
  }

  function updateCron(expression) {
    patch({
      type: 'cron',
      expression,
      schedule_type: inferScheduleType(expression),
    });
  }

  return (
    <article className="trigger-row">
      <span className="trigger-icon" aria-hidden="true"><CalendarClock size={17} /></span>
      <div className="trigger-main">
        <div className="trigger-topline">
          <label className="trigger-type-select">
            <span className="sr-only">Schedule type</span>
            <select value={scheduleType} onChange={(event) => changeScheduleType(event.target.value)}>
              {SCHEDULE_TYPES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
              {scheduleType === 'manual' && <option value="manual">On demand</option>}
            </select>
          </label>
          <span className="trigger-order">Trigger {String(index + 1).padStart(2, '0')}</span>
          <label className="mini-toggle" title={trigger.enabled ? 'Disable trigger' : 'Enable trigger'}>
            <input
              type="checkbox"
              checked={trigger.enabled}
              onChange={(event) => patch({ enabled: event.target.checked })}
            />
            <span />
          </label>
          <button
            type="button"
            className="icon-button quiet"
            onClick={() => onRemove(index)}
            aria-label={`Remove trigger ${index + 1}`}
          >
            <Trash2 size={14} />
          </button>
        </div>

        {scheduleType !== 'manual' && (
          <>
            {scheduleType === 'minutes' && (
              <label className="schedule-control">
                <span>Run every</span>
                <span className="number-field">
                  <input
                    type="number"
                    min="1"
                    max="59"
                    value={minuteCount}
                    onChange={(event) => {
                      const value = Math.min(59, Math.max(1, Number(event.target.value) || 1));
                      updateCron(`*/${value} * * * *`);
                    }}
                  />
                  <small>minutes</small>
                </span>
              </label>
            )}
            {(scheduleType === 'daily' || scheduleType === 'weekly' || scheduleType === 'monthly') && (
              <div className="schedule-controls">
                {scheduleType === 'weekly' && (
                  <label className="schedule-control">
                    <span>Day</span>
                    <select
                      className="compact-input"
                      value={weekday}
                      onChange={(event) => updateCron(timedExpression('weekly', scheduleTime, event.target.value))}
                    >
                      {WEEKDAYS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                )}
                <label className="schedule-control">
                  <span>Time</span>
                  <input
                    className="compact-input"
                    type="time"
                    value={scheduleTime}
                    onChange={(event) => updateCron(timedExpression(scheduleType, event.target.value, weekday))}
                  />
                </label>
                {scheduleType === 'monthly' && <span className="schedule-assumption">On day 1</span>}
              </div>
            )}
            <label className="cron-expression-field">
              <span>Cron expression</span>
              <input
                className="input mono"
                value={trigger.expression}
                onChange={(event) => updateCron(event.target.value)}
                placeholder="0 9 * * 1-5"
                spellCheck="false"
              />
              <small>5 fields use minutes; add a sixth for seconds.</small>
            </label>
            <CronPreview trigger={trigger} />
          </>
        )}

        {scheduleType === 'manual' && <CronPreview trigger={trigger} />}
      </div>
    </article>
  );
}

function HistoryView({ runs, stats }) {
  return (
    <div className="history-view reveal">
      <div className="run-stats-grid">
        <div className="run-stat-card">
          <span className="run-stat-icon success"><CheckCircle2 size={16} /></span>
          <div><span>Successful · 24h</span><strong>{stats.successful_24h}</strong></div>
        </div>
        <div className="run-stat-card">
          <span className="run-stat-icon failure"><XCircle size={16} /></span>
          <div><span>Failed · 24h</span><strong>{stats.failed_24h}</strong></div>
        </div>
        <div className="run-stat-card">
          <span className="run-stat-icon success"><CheckCircle2 size={16} /></span>
          <div><span>Successful · 7d</span><strong>{stats.successful_7d}</strong></div>
        </div>
        <div className="run-stat-card">
          <span className="run-stat-icon failure"><XCircle size={16} /></span>
          <div><span>Failed · 7d</span><strong>{stats.failed_7d}</strong></div>
        </div>
      </div>

      <section className="table-panel history-table-panel">
        <div className="history-table-head">
          <div>
            <h2>Runs</h2>
            <p>Runs for this automation.</p>
          </div>
          <span>{runs.length} records</span>
        </div>
        {runs.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Automation</th>
                  <th>Triggered</th>
                  <th>Tools</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <span className="table-run-icon automation"><CalendarClock size={14} /></span>
                      <div>
                        <strong>{run.automation_name || 'Automation'}</strong>
                        <small>{run.trigger_type === 'schedule' ? 'Scheduled' : 'Manual test'}</small>
                      </div>
                    </td>
                    <td>
                      <strong className="date-cell">{formatDate(run.created_at)}</strong>
                      <small>{formatRelative(run.created_at)}</small>
                    </td>
                    <td>
                      <div className="table-tools">
                        {run.tools_used.length
                          ? run.tools_used.map((tool) => (
                            <span className="table-tool-chip" key={tool}>
                              <GitBranch size={11} />
                              {tool === 'push_branch' ? 'Pull request' : tool}
                            </span>
                          ))
                          : <span className="subtle">—</span>}
                      </div>
                    </td>
                    <td><StatusBadge status={run.status} /></td>
                    <td><span className="mono subtle">{formatDuration(run.duration_ms)}</span></td>
                    <td><Link to={`/runs/${run.id}`} className="row-arrow" aria-label="Open run">↗</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="history-empty">
            <History size={22} />
            <p>No runs yet.</p>
            <span>Use Test to start a run.</span>
          </div>
        )}
      </section>
    </div>
  );
}

export default function AutomationEditorPage() {
  const { automationId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const menu = useRef(null);
  const config = useRemote('/api/config');
  const repos = useRemote('/api/repos');
  const [automation, setAutomation] = useState(null);
  const [runs, setRuns] = useState([]);
  const [stats, setStats] = useState(emptyStats);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(Boolean(automationId));
  const [saving, setSaving] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [managingTool, setManagingTool] = useState('');
  const activeTab = searchParams.get('tab') === 'history' ? 'history' : 'settings';

  useEffect(() => {
    let cancelled = false;
    async function loadAutomation() {
      if (!automationId) return;
      setLoading(true);
      try {
        const [automationResult, runsResult] = await Promise.all([
          api.get(`/api/automations/${automationId}`),
          api.get(`/api/automations/${automationId}/runs`),
        ]);
        if (cancelled) return;
        const item = automationResult.automation;
        setAutomation(item);
        setRuns(runsResult.runs || []);
        setStats({ ...emptyStats, ...item.stats, ...runsResult.stats });
        setForm({
          name: item.name,
          repo_dir: item.repo_dir,
          instructions: item.instructions,
          model: item.model,
          effort: item.effort,
          enabled: item.enabled,
          tool_push_branch: item.tool_push_branch,
          memories_enabled: item.memories_enabled,
          memory_notes: item.memory_notes || '',
          triggers: item.triggers.map(triggerFromSaved),
        });
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadAutomation();
    return () => { cancelled = true; };
  }, [automationId]);

  useEffect(() => {
    if (automationId || form || !config.data || !repos.data) return;
    const firstRepo = repos.data.repos.find((repo) => repo.isGit)?.path || repos.data.repos[0]?.path || '';
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    setForm({
      name: '',
      repo_dir: firstRepo,
      instructions: '',
      model: config.data.defaults.model,
      effort: config.data.defaults.effort,
      enabled: true,
      tool_push_branch: false,
      memories_enabled: true,
      memory_notes: '',
      triggers: [newTrigger(timezone)],
    });
  }, [automationId, form, config.data, repos.data]);

  const automationTimezone = form?.triggers.find((trigger) => trigger.type === 'cron')?.timezone
    || form?.triggers[0]?.timezone
    || 'UTC';

  const nextRun = useMemo(
    () => automation?.triggers?.map((trigger) => trigger.next_run_at).filter(Boolean).sort()[0] || null,
    [automation],
  );

  const effortLabel = useMemo(() => {
    const labels = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra High' };
    return labels[form?.effort] || form?.effort || 'Medium';
  }, [form?.effort]);

  function update(key, value) {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateTrigger(index, trigger) {
    setSaved(false);
    setForm((current) => ({
      ...current,
      triggers: current.triggers.map((item, itemIndex) => itemIndex === index ? trigger : item),
    }));
  }

  function removeTrigger(index) {
    setSaved(false);
    setForm((current) => ({
      ...current,
      triggers: current.triggers.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function addTrigger() {
    setSaved(false);
    setForm((current) => ({
      ...current,
      triggers: [...current.triggers, newTrigger(automationTimezone)],
    }));
  }

  function setAutomationTimezone(timezone) {
    setSaved(false);
    setForm((current) => ({
      ...current,
      triggers: current.triggers.map((trigger) => ({ ...trigger, timezone })),
    }));
  }

  function payload() {
    return {
      name: form.name,
      repoDir: form.repo_dir,
      instructions: form.instructions,
      model: form.model,
      effort: form.effort,
      enabled: form.enabled,
      tool_push_branch: form.tool_push_branch,
      memories_enabled: form.memories_enabled,
      memory_notes: form.memory_notes || '',
      triggers: form.triggers.map((trigger) => ({
        id: trigger.id,
        type: trigger.type,
        expression: trigger.type === 'manual' ? null : trigger.expression,
        timezone: trigger.timezone,
        enabled: trigger.enabled,
      })),
    };
  }

  async function writeAutomation() {
    const method = automationId ? 'put' : 'post';
    const path = automationId ? `/api/automations/${automationId}` : '/api/automations';
    return api[method](path, payload());
  }

  async function save(event) {
    event?.preventDefault();
    if (!form || saving) return;
    if (form.triggers.length === 0) {
      setError('Add at least one trigger before saving.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await writeAutomation();
      setAutomation(result.automation);
      setStats((current) => ({ ...current, ...result.automation.stats }));
      setSaved(true);
      if (!automationId) navigate(`/automations/${result.automation.id}`, { replace: true });
      window.setTimeout(() => setSaved(false), 2200);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function testAutomation() {
    if (!form || runningNow) return;
    if (form.triggers.length === 0) {
      setError('Add at least one trigger before testing.');
      return;
    }
    setRunningNow(true);
    setError('');
    try {
      const savedResult = await writeAutomation();
      const savedAutomation = savedResult.automation;
      setAutomation(savedAutomation);
      setSaved(true);
      const result = await api.post(`/api/automations/${savedAutomation.id}/run`, {});
      navigate(`/runs/${result.run.id}`);
    } catch (runError) {
      setError(runError.message);
      setRunningNow(false);
    }
  }

  async function duplicateAutomation() {
    menu.current?.removeAttribute('open');
    setDuplicating(true);
    setError('');
    try {
      const result = await api.post('/api/automations', {
        ...payload(),
        name: `${form.name} copy`,
        triggers: form.triggers.map((trigger) => ({ ...trigger, id: uid() })),
      });
      navigate(`/automations/${result.automation.id}`);
    } catch (duplicateError) {
      setError(duplicateError.message);
      setDuplicating(false);
    }
  }

  async function deleteAutomation() {
    menu.current?.removeAttribute('open');
    if (!automationId) return;
    if (!window.confirm('Delete this automation and its trigger definitions? Existing run records will remain.')) return;
    setDeleting(true);
    try {
      await api.delete(`/api/automations/${automationId}`);
      navigate('/automations');
    } catch (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
    }
  }

  function autoGrow(event) {
    const textarea = event.currentTarget;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(420, Math.max(160, textarea.scrollHeight))}px`;
  }

  if (!form || !config.data || !repos.data) {
    const loadError = error || config.error || repos.error;
    if (loadError) return <ErrorState message={loadError} onRetry={() => window.location.reload()} />;
    if (loading || config.loading || repos.loading) {
      return <Loading label={automationId ? 'Loading automation…' : 'Loading editor…'} />;
    }
    return <ErrorState message="The automation editor could not be prepared." />;
  }

  const timezoneOptions = config.data.timezones.includes(automationTimezone)
    ? config.data.timezones
    : [automationTimezone, ...config.data.timezones];

  return (
    <div className="page automation-editor-page">
      <div className="editor-breadcrumb reveal">
        <Link to="/automations" className="back-link"><ArrowLeft size={15} /> Automations</Link>
        <span>{automationId ? 'Edit' : 'New'}</span>
      </div>

      <header className="automation-header reveal">
        <div className="automation-heading">
          <span className="automation-avatar"><CalendarClock size={21} /></span>
          <div className="automation-name-wrap">
            <label htmlFor="automation-name">Automation name</label>
            <input
              id="automation-name"
              className="automation-name-input"
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder="Untitled automation"
              autoComplete="off"
            />
          </div>
        </div>
        <div className="editor-head-actions">
          {saved && <span className="save-confirmation"><Check size={13} /> Saved</span>}
          <button type="button" className="button primary" onClick={save} disabled={saving || runningNow}>
            {saving ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />}
            Save
          </button>
          <button type="button" className="button secondary" onClick={testAutomation} disabled={saving || runningNow}>
            {runningNow ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />}
            Test
          </button>
          <details className="action-menu" ref={menu}>
            <summary aria-label="More automation actions"><MoreHorizontal size={17} /></summary>
            <div className="action-menu-popover">
              <button type="button" onClick={duplicateAutomation} disabled={!automationId || duplicating}>
                <Copy size={14} /> Duplicate
              </button>
              <button type="button" className="danger-action" onClick={deleteAutomation} disabled={!automationId || deleting}>
                <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </details>
        </div>
      </header>

      <div className="automation-subheader reveal">
        <button
          type="button"
          className={`state-switch ${form.enabled ? 'on' : ''}`}
          role="switch"
          aria-checked={form.enabled}
          onClick={() => update('enabled', !form.enabled)}
        >
          <span className="state-switch-track"><span /></span>
          <span>{form.enabled ? 'Enabled' : 'Paused'}</span>
        </button>
        <span className="automation-meta-chip" title={form.repo_dir}>
          <FolderGit2 size={13} />
          <span className="mono">{form.repo_dir || 'Select a repository'}</span>
          <small>{repoName(form.repo_dir)}</small>
        </span>
        <span className="automation-author"><UserRound size={13} /> By {config.data.gitUser || 'Local user'}</span>
        {nextRun && <span className="automation-next-run"><Clock3 size={13} /> Next {formatRelative(nextRun)}</span>}
      </div>

      <div className="editor-tabs reveal delay-1">
        <button
          type="button"
          className={activeTab === 'settings' ? 'active' : ''}
          onClick={() => setSearchParams({})}
        >
          Settings
        </button>
        <button
          type="button"
          className={activeTab === 'history' ? 'active' : ''}
          onClick={() => setSearchParams({ tab: 'history' })}
          disabled={!automationId}
        >
          Runs
          {automationId && <span>{stats.total || 0}</span>}
        </button>
      </div>

      {error && <div className="inline-error">{error}</div>}

      {activeTab === 'history' ? (
        <HistoryView runs={runs} stats={stats} />
      ) : (
        <form className="automation-settings reveal delay-1" onSubmit={save}>
          <section className="settings-section working-directory-section">
            <div className="section-title-row">
              <div>
                <h2>Working directory</h2>
                <p>Choose a repository or enter a directory path.</p>
              </div>
            </div>
            <RepoDirectoryField
              repos={repos.data?.repos || []}
              value={form.repo_dir}
              onChange={(value) => update('repo_dir', value)}
              inputId="automation-repo-directory"
              listId="automation-repo-options"
              required
            />
          </section>

          <section className="settings-section triggers-section">
            <div className="section-title-row">
              <div>
                <h2>Triggers</h2>
                <p>Choose when this automation runs.</p>
              </div>
              <label className="timezone-picker">
                <span>Timezone</span>
                <select value={automationTimezone} onChange={(event) => setAutomationTimezone(event.target.value)}>
                  {timezoneOptions.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
                </select>
              </label>
            </div>

            <div className="trigger-list">
              {form.triggers.map((trigger, index) => (
                <TriggerRow
                  key={trigger.id}
                  trigger={trigger}
                  index={index}
                  onChange={updateTrigger}
                  onRemove={removeTrigger}
                />
              ))}
            </div>
            <button type="button" className="add-trigger-button" onClick={addTrigger}>
              <Plus size={15} /> Add trigger
            </button>
            {form.triggers.length === 0 && <p className="field-error">Add at least one trigger to save this automation.</p>}
          </section>

          <section className="settings-section">
            <div className="section-title-row">
              <div>
                <h2>Instructions</h2>
                <p>Describe the task and how Codex should verify it.</p>
              </div>
            </div>
            <textarea
              className="instructions-textarea"
              value={form.instructions}
              onChange={(event) => update('instructions', event.target.value)}
              onInput={autoGrow}
              placeholder="Review the latest changes for regressions. Fix what you find, run the test suite, and summarize the outcome…"
              rows={7}
              required
            />
            <div className="field-meta-row">
              <span>Instructions are sent to Codex on every run.</span>
              <span>{form.instructions.length.toLocaleString()} characters</span>
            </div>
          </section>

          <section className="settings-section model-section">
            <div className="section-title-row">
              <div>
                <h2>Model & effort</h2>
                <p>Choose the model and reasoning effort.</p>
              </div>
            </div>
            <div className="model-picker-row">
              <label className="picker-label">Model + effort</label>
              <div className="model-picker">
                <Sparkles size={15} />
                <select value={form.model} onChange={(event) => update('model', event.target.value)} aria-label="Model">
                  {!config.data.models.includes(form.model) && <option value={form.model}>{form.model}</option>}
                  {config.data.models.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
                <span className="picker-divider" />
                <select value={form.effort} onChange={(event) => update('effort', event.target.value)} aria-label="Reasoning effort">
                  {config.data.efforts.map((effort) => {
                    const labels = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra High' };
                    return <option key={effort} value={effort}>{labels[effort] || effort}</option>;
                  })}
                </select>
              </div>
              <span className="model-summary-pill"><Code2 size={13} /> {form.model} · {effortLabel}</span>
            </div>
          </section>

          <section className="settings-section tools-section">
            <div className="section-title-row">
              <div>
                <h2>Tools</h2>
                <p>Configure optional actions and persistent context.</p>
              </div>
            </div>
            <div className="tool-list">
              <div className={`tool-row ${form.tool_push_branch ? 'enabled' : ''}`}>
                <span className="tool-option-icon"><GitBranch size={17} /></span>
                <div className="tool-row-copy">
                  <strong>Open pull request</strong>
                  <span>Push the branch after a successful run.</span>
                </div>
                <button type="button" className="text-action" onClick={() => setManagingTool(managingTool === 'push' ? '' : 'push')}>
                  Manage
                </button>
                <label className="tool-switch">
                  <input
                    type="checkbox"
                    checked={form.tool_push_branch}
                    onChange={(event) => update('tool_push_branch', event.target.checked)}
                  />
                  <span />
                </label>
                <button
                  type="button"
                  className="icon-button quiet"
                  onClick={() => update('tool_push_branch', false)}
                  aria-label="Remove pull request action"
                >
                  <X size={14} />
                </button>
              </div>
              {managingTool === 'push' && (
                <div className="tool-manage-note">
                  Runs <code>git push</code> in the repository after Codex exits successfully. Authentication must already be available to the runtime.
                </div>
              )}

              <div className={`tool-row ${form.memories_enabled ? 'enabled' : ''}`}>
                <span className="tool-option-icon memory"><MemoryStick size={17} /></span>
                <div className="tool-row-copy">
                  <strong>Memories</strong>
                  <span>Append persistent repository context to every prompt.</span>
                </div>
                <button type="button" className="text-action" onClick={() => setManagingTool(managingTool === 'memories' ? '' : 'memories')}>
                  Manage
                </button>
                <label className="tool-switch">
                  <input
                    type="checkbox"
                    checked={form.memories_enabled}
                    onChange={(event) => update('memories_enabled', event.target.checked)}
                  />
                  <span />
                </label>
                <button
                  type="button"
                  className="icon-button quiet"
                  onClick={() => update('memories_enabled', false)}
                  aria-label="Remove Memories tool"
                >
                  <X size={14} />
                </button>
              </div>
              {managingTool === 'memories' && (
                <div className="tool-manage-panel">
                  <Toggle
                    checked={form.memories_enabled}
                    onChange={(value) => update('memories_enabled', value)}
                    label="Use persistent context"
                    description="Append the notes below to the instructions at run time."
                  />
                  {form.memories_enabled && (
                    <label className="field memory-notes">
                      <span>Persistent context</span>
                      <textarea
                        className="input"
                        rows={4}
                        value={form.memory_notes}
                        onChange={(event) => update('memory_notes', event.target.value)}
                        placeholder="Add repository conventions or context for every run."
                      />
                    </label>
                  )}
                </div>
              )}
            </div>
          </section>
        </form>
      )}
    </div>
  );
}
