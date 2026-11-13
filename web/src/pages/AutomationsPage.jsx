import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Cog,
  GitPullRequestArrow,
  History,
  Plus,
  Power,
  Sparkles,
  Zap,
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
        <div className="automation-symbol"><Zap size={18} /></div>
        <button
          type="button"
          className={`power-toggle ${automation.enabled ? 'on' : ''}`}
          onClick={() => onToggle(automation)}
          disabled={toggling}
          aria-label={automation.enabled ? 'Disable automation' : 'Enable automation'}
        >
          <Power size={13} />
          {automation.enabled ? 'Active' : 'Paused'}
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
        <span><GitPullRequestArrow size={13} /> {repoName(automation.repo_dir)}</span>
        <span><Sparkles size={13} /> {automation.model}</span>
      </div>
      <div className="automation-stats">
        <span><CheckCircle2 size={13} /> {automation.stats.successful_7d} passed</span>
        <span><History size={13} /> {automation.stats.total} total</span>
        <Link to={`/automations/${automation.id}?tab=history`}>History ↗</Link>
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

  if (loading && !data) return <Loading label="Loading automation fleet…" />;
  if (error && !data) return <ErrorState message={error} onRetry={() => reload()} />;
  const automations = data?.automations || [];
  const enabled = automations.filter((automation) => automation.enabled).length;
  const totalRuns = automations.reduce((sum, item) => sum + item.stats.total, 0);

  return (
    <div className="page">
      <PageIntro
        eyebrow="Always-on operations"
        title={<>Work that keeps<br /><em>working.</em></>}
        description="Schedule Codex against your repositories. Automations run locally, keep their context, and leave a complete audit trail."
        actions={(
          <button type="button" className="button primary" onClick={() => navigate('/automations/new')}>
            <Plus size={16} /> New automation
          </button>
        )}
      />

      <div className="automation-overview reveal delay-1">
        <div className="automation-hero-copy">
          <span className="fleet-signal"><span /> SCHEDULER ONLINE</span>
          <h2>{enabled} routine{enabled === 1 ? '' : 's'} armed</h2>
          <p>Catch-up is off. Missed windows are skipped, so runs never pile up after downtime.</p>
        </div>
        <div className="automation-hero-stats">
          <div><strong>{automations.length}</strong><span>Automations</span></div>
          <div><strong>{enabled}</strong><span>Enabled</span></div>
          <div><strong>{totalRuns}</strong><span>All runs</span></div>
        </div>
        <div className="hero-grid-lines" />
      </div>

      <section className="content-section reveal delay-2">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Automation fleet</p>
            <h2>Scheduled agents</h2>
          </div>
          <span className="section-note">Times shown in your local timezone</span>
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
              <strong>Add a routine</strong>
              <small>Schedule the next piece of work.</small>
            </button>
          </div>
        ) : (
          <EmptyState
            icon={CalendarClock}
            title="No automations yet"
            body="Create a recurring agent, attach a cron trigger, and let it work while you’re away."
            action={() => navigate('/automations/new')}
            actionLabel="Create your first automation"
          />
        )}
      </section>
    </div>
  );
}
