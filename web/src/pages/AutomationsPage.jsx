import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Cog,
  FolderGit2,
  History,
  Plus,
  Power,
} from 'lucide-react';
import { api, automationPayload } from '../api.js';
import { useRemote } from '../hooks.js';
import { formatDate, formatRelative, repoName } from '../utils.js';
import { EmptyState, ErrorState, Loading, PageIntro } from '../components/Common.jsx';

function AutomationCard({ automation, onToggle, toggling }) {
  const nextSchedule = automation.triggers.find((trigger) => trigger.next_run_at);
  return (
    <article className={`automation-card reveal ${automation.enabled ? '' : 'is-paused'}`}>
      <div className="automation-card-head">
        <div className="automation-symbol"><CalendarClock size={17} /></div>
        <button
          type="button"
          className={`power-toggle ${automation.enabled ? 'on' : ''}`}
          onClick={() => onToggle(automation)}
          disabled={toggling}
          aria-label={automation.enabled ? 'Disable automation' : 'Enable automation'}
        >
          <Power size={13} />
          {automation.enabled ? 'Enabled' : 'Paused'}
        </button>
      </div>
      <Link to={`/automations/${automation.id}`} className="automation-title-link">
        <h3>{automation.name}</h3>
        <ArrowUpRight size={16} />
      </Link>
      <p className="automation-instructions">{automation.instructions}</p>
      <div className="automation-schedules">
        {automation.triggers.map((trigger) => (
          <span className="schedule-chip" key={trigger.id}>
            {trigger.type === 'cron' ? <CalendarClock size={12} /> : <Cog size={12} />}
            {trigger.type === 'cron' ? trigger.description : 'Manual'}
            {trigger.type === 'cron' && <small>{trigger.timezone}</small>}
          </span>
        ))}
      </div>
      <div className="automation-next">
        <span className="next-orbit"><Clock3 size={14} /></span>
        <div>
          <small>Next run</small>
          <strong>{nextSchedule ? `${formatRelative(nextSchedule.next_run_at)} · ${formatDate(nextSchedule.next_run_at)}` : 'Manual only'}</strong>
        </div>
      </div>
      <div className="automation-meta">
        <span><FolderGit2 size={13} /> {repoName(automation.repo_dir)}</span>
        <span className="mono">{automation.model}</span>
      </div>
      <div className="automation-stats">
        <span><CheckCircle2 size={13} /> {automation.stats.successful_7d} succeeded</span>
        <span><History size={13} /> {automation.stats.total} run{automation.stats.total === 1 ? '' : 's'}</span>
        <Link to={`/automations/${automation.id}?tab=history`}>Runs ↗</Link>
      </div>
    </article>
  );
}

export default function AutomationsPage() {
  const navigate = useNavigate();
  const { data, setData, error, loading, reload } = useRemote('/api/automations');
  const [toggling, setToggling] = useState('');

  async function toggle(automation) {
    setToggling(automation.id);
    const nextEnabled = !automation.enabled;
    setData((current) => ({
      automations: current.automations.map((item) => item.id === automation.id
        ? { ...item, enabled: nextEnabled }
        : item),
    }));
    try {
      const result = await api.put(
        `/api/automations/${automation.id}`,
        automationPayload(automation, { enabled: nextEnabled }),
      );
      setData((current) => ({
        automations: current.automations.map((item) => item.id === automation.id ? result.automation : item),
      }));
    } catch {
      await reload(true);
    } finally {
      setToggling('');
    }
  }

  if (loading && !data) return <Loading label="Loading automations…" />;
  if (error && !data) return <ErrorState message={error} onRetry={() => reload()} />;
  const automations = data?.automations || [];
  const enabled = automations.filter((automation) => automation.enabled).length;
  const totalRuns = automations.reduce((sum, item) => sum + item.stats.total, 0);

  return (
    <div className="page">
      <PageIntro
        title="Automations"
        description="Scheduled agents that run Codex in your repositories."
        actions={(
          <button type="button" className="button primary" onClick={() => navigate('/automations/new')}>
            <Plus size={16} /> New automation
          </button>
        )}
      />

      <div className="metric-strip automation-summary reveal delay-1">
        <div className="metric">
          <span className="metric-icon neutral"><CalendarClock size={17} /></span>
          <div><strong>{automations.length}</strong><span>Automations</span></div>
        </div>
        <div className="metric">
          <span className="metric-icon orange"><Power size={17} /></span>
          <div><strong>{enabled}</strong><span>Enabled</span></div>
        </div>
        <div className="metric">
          <span className="metric-icon blue"><History size={17} /></span>
          <div><strong>{totalRuns}</strong><span>Runs</span></div>
        </div>
      </div>

      <section className="content-section reveal delay-2">
        <div className="section-heading">
          <div>
            <h2>Scheduled automations</h2>
          </div>
          <span className="section-note">Times use your local timezone</span>
        </div>
        {automations.length ? (
          <div className="automation-grid">
            {automations.map((automation) => (
              <AutomationCard
                key={automation.id}
                automation={automation}
                onToggle={toggle}
                toggling={toggling === automation.id}
              />
            ))}
            <button type="button" className="automation-add-card reveal" onClick={() => navigate('/automations/new')}>
              <span><Plus size={20} /></span>
              <strong>New automation</strong>
              <small>Create a scheduled agent.</small>
            </button>
          </div>
        ) : (
          <EmptyState
            icon={CalendarClock}
            title="No automations yet"
            body="Scheduled agents that run in your repositories will appear here."
            action={() => navigate('/automations/new')}
            actionLabel="Create one"
          />
        )}
      </section>
    </div>
  );
}
