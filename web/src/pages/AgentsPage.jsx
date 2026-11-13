import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FolderGit2,
  Plus,
  TerminalSquare,
} from 'lucide-react';
import { useRemote } from '../hooks.js';
import { formatRelative, repoName, triggerLabel } from '../utils.js';
import { EmptyState, ErrorState, Loading, PageIntro, StatusBadge } from '../components/Common.jsx';

function RepoCard({ repo, index }) {
  return (
    <Link
      to={`/new?repo=${encodeURIComponent(repo.path)}`}
      className="repo-card reveal"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div className="repo-card-top">
        <span className="repo-icon"><FolderGit2 size={20} /></span>
        <span className={`repo-kind ${repo.isGit ? '' : 'plain'}`}>
          {repo.isGit ? 'Git repository' : 'Directory'}
        </span>
        <ArrowUpRight className="repo-arrow" size={17} />
      </div>
      <h3>{repo.name}</h3>
      <p className="mono path-line">{repo.path}</p>
      <div className="repo-card-footer">
        <span><TerminalSquare size={13} /> {repo.runCount} run{repo.runCount === 1 ? '' : 's'}</span>
        <span>{repo.lastRunAt ? formatRelative(repo.lastRunAt) : 'No runs yet'}</span>
      </div>
      {repo.runningCount > 0 && (
        <span className="repo-live"><span /> {repo.runningCount} active</span>
      )}
    </Link>
  );
}

export default function AgentsPage() {
  const { data, error, loading, reload } = useRemote('/api/agents');
  if (loading && !data) return <Loading label="Loading agents…" />;
  if (error && !data) return <ErrorState message={error} onRetry={() => reload()} />;

  const repos = data?.repos || [];
  const runs = data?.recentRuns || [];
  const counts = data?.counts || {};

  return (
    <div className="page">
      <PageIntro
        title="Agents"
        description="Run Codex in repositories on this machine."
        actions={(
          <Link to="/new" className="button primary">
            <Plus size={16} /> New agent
          </Link>
        )}
      />

      <section className="metric-strip reveal delay-1">
        <div className="metric">
          <span className="metric-icon lime"><Bot size={17} /></span>
          <div><strong>{data?.automationCount || 0}</strong><span>Automations</span></div>
        </div>
        <div className="metric">
          <span className="metric-icon blue"><TerminalSquare size={17} /></span>
          <div><strong>{counts.total || 0}</strong><span>Runs</span></div>
        </div>
        <div className="metric">
          <span className="metric-icon orange"><CheckCircle2 size={17} /></span>
          <div><strong>{counts.succeeded || 0}</strong><span>Succeeded</span></div>
        </div>
        <div className="metric">
          <span className="metric-icon neutral"><Clock3 size={17} /></span>
          <div><strong>{counts.running || 0}</strong><span>Running</span></div>
        </div>
      </section>

      <section className="content-section reveal delay-2">
        <div className="section-heading">
          <div>
            <h2>Repositories</h2>
          </div>
          <span className="section-note">{repos.length} director{repos.length === 1 ? 'y' : 'ies'}</span>
        </div>
        {repos.length ? (
          <div className="repo-grid">
            {repos.map((repo, index) => <RepoCard key={repo.path} repo={repo} index={index} />)}
          </div>
        ) : (
          <EmptyState
            icon={FolderGit2}
            title="No repositories found"
            body="Add a project under /www or /root, then refresh this page."
          />
        )}
      </section>

      <section className="content-section reveal delay-3">
        <div className="section-heading">
          <div>
            <h2>Runs</h2>
          </div>
          <Link to="/runs" className="text-link">View all runs <ArrowUpRight size={14} /></Link>
        </div>
        {runs.length ? (
          <div className="recent-list">
            {runs.slice(0, 7).map((run) => (
              <Link to={`/runs/${run.id}`} className="recent-row" key={run.id}>
                <span className={`run-glyph ${run.status}`}>
                  {run.automation_name ? <CalendarClock size={15} /> : <TerminalSquare size={15} />}
                </span>
                <div className="recent-main">
                  <strong>{triggerLabel(run)}</strong>
                  <span>{repoName(run.repo_dir)} · {formatRelative(run.created_at)}</span>
                </div>
                <span className="recent-model mono">{run.model}</span>
                <StatusBadge status={run.status} />
                <ArrowUpRight size={15} className="recent-arrow" />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={TerminalSquare}
            title="No runs yet"
            body="Runs started from an agent will appear here."
            action={undefined}
          />
        )}
      </section>
    </div>
  );
}
