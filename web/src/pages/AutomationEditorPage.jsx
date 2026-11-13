import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleSlash2,
  Clock3,
  Code2,
  GitBranch,
  History,
  LoaderCircle,
  MemoryStick,
  Play,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Wrench,
  XCircle,
} from 'lucide-react';
import { api } from '../api.js';
import { useRemote } from '../hooks.js';
import { formatDate, formatDuration, formatRelative, repoName, triggerLabel } from '../utils.js';
import { ErrorState, Loading, StatusBadge, Toggle } from '../components/Common.jsx';

const defaultTrigger = () => ({
  id: crypto.randomUUID(),
  type: 'cron',
  expression: '0 9 * * *',
  timezone: 'UTC',
  enabled: true,
});

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
      } catch (error) {
        if (!cancelled) setPreview({ valid: false, error: error.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 260);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trigger.type, trigger.expression, trigger.timezone]);

  return (
    <div className={`cron-preview ${preview?.valid === false ? 'invalid' : ''}`}>
      <span className="cron-preview-icon">
        {loading ? <LoaderCircle size={14} className="spin" /> : preview?.valid === false ? <XCircle size={14} /> : <CalendarClock size={14} />}
      </span>
      <div>
        <strong>{preview?.valid === false ? preview.error : preview?.description || 'Checking schedule…'}</strong>
        {preview?.nextRunAt && <small>Next: {formatDate(preview.nextRunAt, { weekday: 'short' })} · {formatRelative(preview.nextRunAt)}</small>}
      </div>
    </div>
  );
}

function TriggerCard({ trigger, index, config, onChange, onRemove, canRemove }) {
  function set(key, value) {
    const patch = { [key]: value };
    if (key === 'type' && value === 'cron' && !trigger.expression) {
      patch.expression = '0 9 * * *';
    }
    onChange(index, { ...trigger, ...patch });
  }

  return (
    <article className="trigger-card">
      <div className="trigger-card-head">
        <span className="trigger-number">0{index + 1}</span>
        <div className="trigger-tabs">
          <button type="button" className={trigger.type === 'cron' ? 'active' : ''} onClick={() => set('type', 'cron')}>
            <CalendarClock size={13} /> Schedule
          </button>
          <button type="button" className={trigger.type === 'manual' ? 'active' : ''} onClick={() => set('type', 'manual')}>
            <Play size={13} /> Manual
          </button>
        </div>
        <label className="mini-toggle">
          <input type="checkbox" checked={trigger.enabled} onChange={(event) => set('enabled', event.target.checked)} />
          <span />
        </label>
        {canRemove && (
          <button type="button" className="icon-button quiet" onClick={() => onRemove(index)} aria-label="Remove trigger">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {trigger.type === 'cron' ? (
        <div className="trigger-body">
          <div className="preset-row">
            {Object.entries(config.cronPresets).map(([expression, label]) => (
              <button
                type="button"
                key={expression}
                className={trigger.expression === expression ? 'active' : ''}
                onClick={() => set('expression', expression)}
              >
                {label.replace('Every ', '')}
              </button>
            ))}
            <span>Custom ↓</span>
          </div>
          <div className="trigger-input-grid">
            <label>
              <span>Cron expression</span>
              <input
                className="input mono"
                value={trigger.expression || ''}
                onChange={(event) => set('expression', event.target.value)}
                placeholder="*/10 * * * *"
              />
            </label>
            <label>
              <span>Timezone</span>
              <select className="input select-input" value={trigger.timezone} onChange={(event) => set('timezone', event.target.value)}>
                {!config.timezones.includes(trigger.timezone) && <option value={trigger.timezone}>{trigger.timezone}</option>}
                {config.timezones.map((timezone) => <option value={timezone} key={timezone}>{timezone}</option>)}
              </select>
            </label>
          </div>
          <CronPreview trigger={trigger} />
          <p className="cron-help">5 fields = minute precision. Add a 6th field for seconds, for example <code>*/30 * * * * *</code>.</p>
        </div>
      ) : (
        <div className="trigger-body manual-trigger-body">
          <span className="manual-orbit"><Play size={16} /></span>
          <div>
            <strong>Run on demand</strong>
            <p>No automatic schedule. Start this automation from its header or API.</p>
          </div>
        </div>
      )}
    </article>
  );
}

function HistoryView({ runs, stats }) {
  return (
    <div className="history-view reveal">
      <div className="history-stats">
        <div>
          <span className="history-stat-icon success"><CheckCircle2 size={17} /></span>
          <div><small>Successful · 24h</small><strong>{stats.successful_24h}</strong></div>
        </div>
        <div>
          <span className="history-stat-icon failure"><XCircle size={17} /></span>
          <div><small>Failed · 24h</small><strong>{stats.failed_24h}</strong></div>
        </div>
        <div>
          <span className="history-stat-icon success"><CheckCircle2 size={17} /></span>
          <div><small>Successful · 7d</small><strong>{stats.successful_7d}</strong></div>
        </div>
        <div>
          <span className="history-stat-icon failure"><XCircle size={17} /></span>
          <div><small>Failed · 7d</small><strong>{stats.failed_7d}</strong></div>
        </div>
      </div>
      <div className="table-panel history-table-panel">
        <div className="history-table-head">
          <div><p className="eyebrow">Run history</p><h2>Recent executions</h2></div>
          <span>{runs.length} records</span>
        </div>
        {runs.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Triggered</th>
                  <th>Trigger</th>
                  <th>Tools used</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td><strong className="date-cell">{formatDate(run.created_at)}</strong><small>{formatRelative(run.created_at)}</small></td>
                    <td><span className="history-trigger">{run.trigger_type === 'schedule' ? <CalendarClock size={13} /> : <Play size={13} />}{run.trigger_type}</span></td>
                    <td>
                      {run.tools_used.length ? run.tools_used.map((tool) => (
                        <span className="tool-use-chip" key={tool}><GitBranch size={12} /> {tool === 'push_branch' ? 'Push branch' : tool}</span>
                      )) : <span className="subtle">None</span>}
                    </td>
                    <td><StatusBadge status={run.status} /></td>
                    <td><span className="mono subtle">{formatDuration(run.duration_ms)}</span></td>
                    <td><Link to={`/runs/${run.id}`} className="row-arrow">↗</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="history-empty"><History size={22} /><p>No executions recorded yet.</p></div>
        )}
      </div>
    </div>
  );
}

export default function AutomationEditorPage() {
  const { automationId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const config = useRemote('/api/config');
  const repos = useRemote('/api/repos');
  const [automation, setAutomation] = useState(null);
  const [runs, setRuns] = useState([]);
  const [stats, setStats] = useState({ successful_24h: 0, failed_24h: 0, successful_7d: 0, failed_7d: 0, total: 0 });
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(Boolean(automationId));
  const [saving, setSaving] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
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
        setStats({ ...item.stats, ...runsResult.stats });
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
          triggers: item.triggers.map((trigger) => ({
            id: trigger.id,
            type: trigger.type,
            expression: trigger.expression || '',
            timezone: trigger.timezone || 'UTC',
            enabled: trigger.enabled,
          })),
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
      triggers: [{ ...defaultTrigger(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }],
    });
  }, [automationId, form, config.data, repos.data]);

  const nextRun = useMemo(() => {
    if (!automation) return null;
    return automation.triggers.map((trigger) => trigger.next_run_at).filter(Boolean).sort()[0] || null;
  }, [automation]);

  const update = (key, value) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateTrigger = (index, trigger) => {
    setSaved(false);
    setForm((current) => ({
      ...current,
      triggers: current.triggers.map((item, itemIndex) => itemIndex === index ? trigger : item),
    }));
  };

  const removeTrigger = (index) => {
    setSaved(false);
    setForm((current) => ({
      ...current,
      triggers: current.triggers.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const addTrigger = (type) => {
    setSaved(false);
    setForm((current) => ({
      ...current,
      triggers: [...current.triggers, {
        ...defaultTrigger(),
        type,
        expression: type === 'manual' ? '' : '0 9 * * *',
      }],
    }));
  };

  async function save(event) {
    event?.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');
    try {
      const method = automationId ? 'put' : 'post';
      const path = automationId ? `/api/automations/${automationId}` : '/api/automations';
      const result = await api[method](path, form);
      setAutomation(result.automation);
      setForm((current) => ({ ...current, repo_dir: result.automation.repo_dir }));
      setSaved(true);
      if (!automationId) navigate(`/automations/${result.automation.id}`, { replace: true });
      setTimeout(() => setSaved(false), 2200);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    if (!automationId) return;
    setRunningNow(true);
    setError('');
    try {
      const result = await api.post(`/api/automations/${automationId}/run`, {});
      navigate(`/runs/${result.run.id}`);
    } catch (runError) {
      setError(runError.message);
      setRunningNow(false);
    }
  }

  async function deleteAutomation() {
    if (!automationId) return;
    if (!window.confirm('Delete this automation and all of its trigger definitions? Existing run records will remain.')) return;
    setDeleting(true);
    try {
      await api.delete(`/api/automations/${automationId}`);
      navigate('/automations');
    } catch (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
    }
  }

  if (loading || !form || !config.data || !repos.data) {
    if (error) return <ErrorState message={error} />;
    return <Loading label={automationId ? 'Opening automation…' : 'Composing a new routine…'} />;
  }

  return (
    <div className="page automation-editor-page">
      <div className="editor-topline reveal">
        <Link to="/automations" className="back-link"><ArrowLeft size={15} /> Automations</Link>
        <div className="editor-top-actions">
          {saved && <span className="save-confirmation"><Check size={13} /> Saved</span>}
          {automationId && (
            <button type="button" className="button secondary small" onClick={runNow} disabled={runningNow}>
              {runningNow ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />}
              Run now
            </button>
          )}
          <button type="button" className="button primary small" onClick={save} disabled={saving || activeTab === 'history'}>
            {saving ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />}
            {automationId ? 'Save changes' : 'Create automation'}
          </button>
        </div>
      </div>

      <header className="automation-editor-head reveal">
        <div className="automation-avatar"><CalendarClock size={24} /></div>
        <div className="automation-editor-title">
          <p className="eyebrow">{automationId ? 'Automation control' : 'New automation'}</p>
          <h1>{form.name || 'Untitled routine'}</h1>
          <span className="mono">{form.repo_dir ? repoName(form.repo_dir) : 'Repository not selected'}</span>
        </div>
        <div className="automation-status-wrap">
          <span className={`automation-live-state ${form.enabled ? 'on' : ''}`}>
            <span /> {form.enabled ? 'Enabled' : 'Paused'}
          </span>
          {nextRun && <small>Next {formatRelative(nextRun)}</small>}
        </div>
      </header>

      <div className="editor-tabs reveal delay-1">
        <button
          type="button"
          className={activeTab === 'settings' ? 'active' : ''}
          onClick={() => setSearchParams({})}
        >
          <Settings2 size={14} /> Configuration
        </button>
        <button
          type="button"
          className={activeTab === 'history' ? 'active' : ''}
          onClick={() => setSearchParams({ tab: 'history' })}
          disabled={!automationId}
        >
          <History size={14} /> Run history <span>{stats.total || 0}</span>
        </button>
      </div>

      {error && <div className="inline-error">{error}</div>}

      {activeTab === 'history' ? (
        <HistoryView runs={runs} stats={stats} />
      ) : (
        <form className="automation-editor-layout reveal delay-1" onSubmit={save}>
          <div className="automation-form-column">
            <section className="form-section">
              <div className="form-section-heading">
                <span>01</span>
                <div><h2>Identity & workspace</h2><p>Give the routine a clear name and a place to work.</p></div>
              </div>
              <div className="two-column-fields">
                <label className="field">
                  <span>Automation name</span>
                  <input className="input" value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Nightly quality pass" required />
                </label>
                <label className="field">
                  <span>Repository</span>
                  <input className="input mono" list="automation-repos" value={form.repo_dir} onChange={(event) => update('repo_dir', event.target.value)} required />
                  <datalist id="automation-repos">
                    {repos.data.repos.map((repo) => <option key={repo.path} value={repo.path}>{repo.name}</option>)}
                  </datalist>
                </label>
              </div>
            </section>

            <section className="form-section">
              <div className="form-section-heading">
                <span>02</span>
                <div><h2>Agent instructions</h2><p>State the desired result and how Codex should verify it.</p></div>
              </div>
              <label className="field">
                <span>Instructions</span>
                <textarea
                  className="input tall-textarea"
                  rows={7}
                  value={form.instructions}
                  onChange={(event) => update('instructions', event.target.value)}
                  placeholder="Review the most recent changes for regressions. Fix issues you find, run the test suite, and summarize the outcome…"
                  required
                />
              </label>
              <div className="two-column-fields">
                <label className="field">
                  <span><Sparkles size={12} /> Model</span>
                  <input className="input" list="automation-models" value={form.model} onChange={(event) => update('model', event.target.value)} required />
                  <datalist id="automation-models">
                    {config.data.models.map((model) => <option key={model} value={model} />)}
                  </datalist>
                </label>
                <label className="field">
                  <span><Code2 size={12} /> Reasoning effort</span>
                  <select className="input select-input" value={form.effort} onChange={(event) => update('effort', event.target.value)}>
                    {config.data.efforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}
                  </select>
                </label>
              </div>
            </section>

            <section className="form-section">
              <div className="form-section-heading">
                <span>03</span>
                <div><h2>Triggers</h2><p>Add schedules, manual controls, or both.</p></div>
              </div>
              <div className="trigger-list">
                {form.triggers.map((trigger, index) => (
                  <TriggerCard
                    key={trigger.id}
                    trigger={trigger}
                    index={index}
                    config={config.data}
                    onChange={updateTrigger}
                    onRemove={removeTrigger}
                    canRemove={form.triggers.length > 1}
                  />
                ))}
              </div>
              <div className="add-trigger-row">
                <button type="button" className="button ghost small" onClick={() => addTrigger('cron')}><Plus size={14} /> Schedule</button>
                <button type="button" className="button ghost small" onClick={() => addTrigger('manual')}><Plus size={14} /> Manual trigger</button>
              </div>
              {form.triggers.length === 0 && <p className="field-error">Add at least one trigger.</p>}
            </section>

            <section className="form-section">
              <div className="form-section-heading">
                <span>04</span>
                <div><h2>Tools & context</h2><p>Choose post-run actions and persistent instructions.</p></div>
              </div>
              <div className="tool-option-card">
                <span className="tool-option-icon"><GitBranch size={17} /></span>
                <Toggle
                  checked={form.tool_push_branch}
                  onChange={(value) => update('tool_push_branch', value)}
                  label="Open Pull Request"
                  description="Runs git push after a successful automation run."
                />
              </div>
              <div className="tool-option-card memory-card">
                <span className="tool-option-icon"><MemoryStick size={17} /></span>
                <Toggle
                  checked={form.memories_enabled}
                  onChange={(value) => update('memories_enabled', value)}
                  label="Memories"
                  description="Append saved repository context to every scheduled prompt."
                />
              </div>
              {form.memories_enabled && (
                <label className="field memory-notes">
                  <span>Persistent context</span>
                  <textarea
                    className="input"
                    rows={3}
                    value={form.memory_notes}
                    onChange={(event) => update('memory_notes', event.target.value)}
                    placeholder="Conventions, environments, or context Codex should remember on every run…"
                  />
                </label>
              )}
            </section>

            {automationId && (
              <section className="danger-zone">
                <div><strong>Delete automation</strong><p>Trigger definitions are removed. Existing runs stay in the ledger.</p></div>
                <button type="button" className="button danger small" onClick={deleteAutomation} disabled={deleting}>
                  <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </section>
            )}
          </div>

          <aside className="automation-preview-column">
            <div className="sticky-preview">
              <div className="preview-top">
                <span className="preview-pulse" />
                <span>ROUTINE PREVIEW</span>
                <Wrench size={14} />
              </div>
              <h3>{form.name || 'Your next routine'}</h3>
              <p>{form.instructions || 'Agent instructions will appear here as you write them.'}</p>
              <div className="preview-rule" />
              <div className="preview-detail">
                <span>Workspace</span>
                <strong className="mono">{repoName(form.repo_dir)}</strong>
              </div>
              <div className="preview-detail">
                <span>Model</span>
                <strong className="mono">{form.model}</strong>
              </div>
              <div className="preview-detail">
                <span>Effort</span>
                <strong>{form.effort}</strong>
              </div>
              <div className="preview-rule" />
              <div className="preview-detail">
                <span>State</span>
                <strong className={form.enabled ? 'green-text' : 'muted'}>{form.enabled ? 'Enabled' : 'Paused'}</strong>
              </div>
              <Toggle
                checked={form.enabled}
                onChange={(value) => update('enabled', value)}
                label="Automation enabled"
                description="Paused automations record skipped manual runs."
              />
              <div className="preview-tools">
                <span>Tools</span>
                <div>
                  {form.tool_push_branch && <span className="tool-use-chip"><GitBranch size={12} /> Push branch</span>}
                  {form.memories_enabled && <span className="tool-use-chip"><MemoryStick size={12} /> Memories</span>}
                  {!form.tool_push_branch && !form.memories_enabled && <small>No post-run tools</small>}
                </div>
              </div>
              <button type="submit" className="button primary preview-save" disabled={saving || form.triggers.length === 0}>
                {saving ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
                {automationId ? 'Save automation' : 'Create automation'}
                <ChevronRight size={14} />
              </button>
            </div>
          </aside>
        </form>
      )}
    </div>
  );
}
