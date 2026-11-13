import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  CheckCircle2,
  Filter,
  Search,
  TerminalSquare,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '../api.js';
import { formatDate, formatDuration, triggerLabel } from '../utils.js';
import { EmptyState, ErrorState, Loading, PageIntro, StatusBadge } from '../components/Common.jsx';

const statusOptions = ['all', 'running', 'succeeded', 'failed', 'stopped', 'skipped'];

export default function RunsPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState([]);
  const [stats, setStats] = useState({
    successful_24h: 0,
    failed_24h: 0,
    successful_7d: 0,
    failed_7d: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ limit: '250' });
        if (search.trim()) params.set('q', search.trim());
        if (status !== 'all') params.set('status', status);
        const result = await api.get(`/api/runs?${params}`);
        if (!cancelled) {
          setRuns(result.runs || []);
          if (result.stats) setStats(result.stats);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search ? 220 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, status]);

  return (
    <div className="page wide-page">
      <PageIntro
        eyebrow="Runs"
        title="Agent runs"
        description="Inspect manual sessions and scheduled automations across your local workspace."
        actions={<span className="record-count"><strong>{runs.length}</strong> records</span>}
      />

      <div className="run-stats-grid reveal delay-1">
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

      <section className="table-panel reveal delay-2">
        <div className="table-toolbar">
          <label className="search-box">
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search agents or repositories…"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><X size={13} /></button>
            )}
          </label>
          <label className="filter-select">
            <Filter size={14} />
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {statusOptions.map((option) => (
                <option value={option} key={option}>{option === 'all' ? 'All statuses' : option}</option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <ErrorState message={error} />
        ) : loading && runs.length === 0 ? (
          <Loading label="Reading the execution ledger…" />
        ) : runs.length === 0 ? (
          <EmptyState
            icon={TerminalSquare}
            title="No matching runs"
            body="Try a different status or search term."
          />
        ) : (
          <div className="data-table-wrap">
            <table className="data-table runs-table">
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
                  <tr key={run.id} onClick={() => navigate(`/runs/${run.id}`)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && navigate(`/runs/${run.id}`)}>
                    <td>
                      <span className={`table-run-icon ${run.automation_name ? 'automation' : ''}`}>
                        {run.automation_name ? <CalendarClock size={14} /> : <TerminalSquare size={14} />}
                      </span>
                      <div>
                        <strong>{triggerLabel(run)}</strong>
                        <small>{run.trigger_type === 'schedule' ? 'Scheduled' : run.trigger_type === 'manual' ? 'Manual' : run.trigger_type}</small>
                      </div>
                    </td>
                    <td><span className="date-cell">{formatDate(run.started_at || run.created_at)}</span></td>
                    <td>
                      <div className="table-tools">
                        {run.tools_used.length
                          ? run.tools_used.map((tool) => <span className="table-tool-chip" key={tool}>{tool === 'push_branch' ? 'Pull request' : tool}</span>)
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
        )}
      </section>
    </div>
  );
}
