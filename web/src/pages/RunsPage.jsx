import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  Filter,
  Search,
  TerminalSquare,
  X,
} from 'lucide-react';
import { api } from '../api.js';
import { formatDate, formatDuration, repoName, triggerLabel } from '../utils.js';
import { EmptyState, ErrorState, Loading, PageIntro, StatusBadge } from '../components/Common.jsx';

const statusOptions = ['all', 'running', 'succeeded', 'failed', 'stopped', 'skipped'];

export default function RunsPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState([]);
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
        if (!cancelled) setRuns(result.runs || []);
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

  const counts = useMemo(() => runs.reduce((acc, run) => {
    acc[run.status] = (acc[run.status] || 0) + 1;
    return acc;
  }, {}), [runs]);

  return (
    <div className="page wide-page">
      <PageIntro
        eyebrow="Execution ledger"
        title="Every run, on the record."
        description="Inspect manual sessions and scheduled automations across all workspaces."
        actions={<span className="record-count"><strong>{runs.length}</strong> records</span>}
      />

      <div className="run-summary-strip reveal delay-1">
        <span><strong>{counts.running || 0}</strong> live</span>
        <span><strong>{counts.succeeded || 0}</strong> succeeded</span>
        <span><strong>{counts.failed || 0}</strong> failed</span>
        <span><strong>{counts.skipped || 0}</strong> skipped</span>
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
                  <th>Agent / trigger</th>
                  <th>Status</th>
                  <th>Repository</th>
                  <th>Model</th>
                  <th>Started</th>
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
                    <td><StatusBadge status={run.status} /></td>
                    <td><span className="repo-cell">{repoName(run.repo_dir)}</span></td>
                    <td><span className="mono subtle mono-small">{run.model}</span></td>
                    <td><span className="date-cell">{formatDate(run.started_at || run.created_at)}</span></td>
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
