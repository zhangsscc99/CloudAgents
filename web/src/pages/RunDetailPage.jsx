import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  Clock3,
  CornerDownLeft,
  Cpu,
  FolderGit2,
  Gauge,
  LoaderCircle,
  MessageSquareReply,
  OctagonX,
  Send,
  TerminalSquare,
} from 'lucide-react';
import { api } from '../api.js';
import { formatDate, formatDuration, repoName, runningDuration, triggerLabel } from '../utils.js';
import { useTicker } from '../hooks.js';
import { ErrorState, Loading, StatusBadge } from '../components/Common.jsx';
import EventTimeline from '../components/EventTimeline.jsx';

function mergeEvent(list, incoming) {
  if (!incoming || list.some((event) => event.seq === incoming.seq)) return list;
  return [...list, incoming].sort((a, b) => a.seq - b.seq);
}

export default function RunDetailPage() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [followUp, setFollowUp] = useState('');
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const now = useTicker(run?.status === 'running');

  useEffect(() => {
    let cancelled = false;
    let source;
    let refreshTimer;

    async function connect() {
      setLoading(true);
      setError('');
      try {
        const [runResult, eventResult] = await Promise.all([
          api.get(`/api/runs/${runId}`),
          api.get(`/api/runs/${runId}/events`),
        ]);
        if (cancelled) return;
        setRun(runResult.run);
        setEvents(eventResult.events || []);
        const lastSeq = eventResult.events?.at(-1)?.seq || 0;
        source = new EventSource(`/api/runs/${runId}/events/stream?after=${lastSeq}`);
        source.addEventListener('run-event', (event) => {
          const incoming = JSON.parse(event.data);
          setEvents((current) => mergeEvent(current, incoming));
          if (incoming.type === 'run.completed') {
            clearTimeout(refreshTimer);
            refreshTimer = setTimeout(async () => {
              try {
                const latest = await api.get(`/api/runs/${runId}`);
                if (!cancelled) setRun(latest.run);
              } catch {
                // The completed status event remains available through SSE.
              }
            }, 150);
          }
        });
        source.addEventListener('run-status', (event) => {
          if (!cancelled) setRun(JSON.parse(event.data));
        });
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    connect();
    return () => {
      cancelled = true;
      clearTimeout(refreshTimer);
      source?.close();
    };
  }, [runId]);

  async function submitFollowUp(event) {
    event?.preventDefault();
    if (!followUp.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const result = await api.post(`/api/runs/${runId}/follow-up`, { prompt: followUp });
      setRun(result.run);
      setFollowUp('');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSending(false);
    }
  }

  async function stopRun() {
    setStopping(true);
    try {
      await api.post(`/api/runs/${runId}/stop`, {});
    } catch (stopError) {
      setError(stopError.message);
    } finally {
      setStopping(false);
    }
  }

  if (loading && !run) return <Loading label="Loading run…" />;
  if (error && !run) return <ErrorState message={error} />;
  if (!run) return null;

  const active = run.status === 'running' || run.status === 'queued';

  return (
    <div className="page run-detail-page">
      <div className="run-nav reveal">
        <button type="button" className="back-link" onClick={() => navigate('/runs')}>
          <ArrowLeft size={15} /> Runs
        </button>
        <span className="run-id mono">{run.id.slice(0, 8)}</span>
      </div>

      <header className="run-hero reveal">
        <div className="run-hero-main">
          <span className={`hero-run-icon ${run.automation_name ? 'automation' : ''}`}>
            {run.automation_name ? <CalendarClock size={22} /> : <TerminalSquare size={22} />}
          </span>
          <div>
            <div className="run-title-line">
              <h1>{triggerLabel(run)}</h1>
              <StatusBadge status={run.status} />
            </div>
            <p className="run-subtitle">
              {repoName(run.repo_dir)} <span>·</span> {run.trigger_type === 'schedule' ? 'Scheduled run' : 'Manual run'}
              <span>·</span> started {formatDate(run.started_at || run.created_at)}
            </p>
          </div>
        </div>
        <div className="run-actions">
          {active ? (
            <button type="button" className="button danger" onClick={stopRun} disabled={stopping}>
              {stopping ? <LoaderCircle size={15} className="spin" /> : <OctagonX size={15} />}
              {stopping ? 'Stopping…' : 'Stop run'}
            </button>
          ) : (
            <button
              type="button"
              className="button secondary"
              onClick={() => document.querySelector('.follow-up-input')?.focus()}
              disabled={!run.session_id}
            >
              <MessageSquareReply size={15} /> Follow up
            </button>
          )}
        </div>
      </header>

      <div className="run-meta-grid reveal delay-1">
        <div>
          <span className="meta-icon"><FolderGit2 size={15} /></span>
          <small>Repository</small>
          <strong className="mono">{run.repo_dir}</strong>
        </div>
        <div>
          <span className="meta-icon"><Cpu size={15} /></span>
          <small>Model</small>
          <strong className="mono">{run.model}</strong>
        </div>
        <div>
          <span className="meta-icon"><Gauge size={15} /></span>
          <small>Reasoning</small>
          <strong>{run.effort}</strong>
        </div>
        <div>
          <span className="meta-icon"><Clock3 size={15} /></span>
          <small>{active ? 'Elapsed' : 'Duration'}</small>
          <strong className="mono">{formatDuration(runningDuration(run, now))}</strong>
        </div>
      </div>

      {run.trigger_reason && (
        <div className="trigger-reason reveal delay-1">
          <CalendarClock size={14} />
          <span>{run.trigger_reason}</span>
          {run.automation_id && <Link to={`/automations/${run.automation_id}`}>Edit automation ↗</Link>}
        </div>
      )}

      {error && <div className="inline-error">{error}</div>}

      <EventTimeline events={events} />

      <form className={`follow-up-box reveal ${!run.session_id ? 'disabled-box' : ''}`} onSubmit={submitFollowUp}>
        <div className="follow-up-heading">
          <MessageSquareReply size={15} />
          <span>Follow up</span>
          {run.session_id ? (
            <span className="session-pill mono">session {run.session_id.slice(0, 8)}</span>
          ) : (
            <span className="session-pill muted">session pending</span>
          )}
        </div>
        <textarea
          className="follow-up-input"
          rows={2}
          value={followUp}
          onChange={(event) => setFollowUp(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submitFollowUp(event);
          }}
          placeholder={run.session_id ? 'Send another instruction.' : 'A session ID will appear when Codex starts.'}
          disabled={!run.session_id || active}
        />
        <div className="follow-up-footer">
          <span><CornerDownLeft size={13} /> Continue the Codex session</span>
          <button className="button primary small" type="submit" disabled={!followUp.trim() || active || !run.session_id || sending}>
            {sending ? <LoaderCircle size={14} className="spin" /> : <Send size={14} />}
            Send follow-up
          </button>
        </div>
      </form>
    </div>
  );
}
