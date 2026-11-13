import { useEffect, useRef, useState } from 'react';
import {
  BrainCircuit,
  Check,
  ChevronDown,
  CircleDot,
  FileDiff,
  Globe2,
  ListChecks,
  MessageSquareText,
  Play,
  Search,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import { eventText, trimOutput } from '../utils.js';

function eventItem(event) {
  return event.payload?.item || event.payload?.msg?.item || null;
}

function eventKind(event) {
  const item = eventItem(event);
  if (item?.type === 'agent_message' || item?.type === 'reasoning' || event.type.startsWith('user.')) return 'messages';
  if (event.type.startsWith('tool.') || item || event.type === 'run.started' || event.type === 'codex.stderr') return 'tools';
  return 'system';
}

function CodeOutput({ children }) {
  if (!children) return null;
  const text = trimOutput(children);
  return <pre className="event-output">{text}</pre>;
}

function EventEntry({ event }) {
  const payload = event.payload || {};
  const item = eventItem(event);

  if (event.type === 'user.prompt' || event.type === 'user.followup') {
    return (
      <article className="event-entry user-message">
        <span className="event-avatar user">YOU</span>
        <div className="event-content">
          <div className="event-title">{event.type === 'user.followup' ? 'Follow-up' : 'Initial prompt'}</div>
          <p className="message-copy">{payload.prompt}</p>
        </div>
      </article>
    );
  }

  if (event.type === 'run.started') {
    return (
      <article className="event-entry system-entry">
        <span className="event-rail-icon"><Play size={12} /></span>
        <div>
          <span className="console-inline">
            <strong>{payload.resumed ? 'Resuming session' : 'Codex session started'}</strong>
            <span className="mono"> · {payload.args?.join(' ')}</span>
          </span>
        </div>
      </article>
    );
  }

  if (event.type === 'run.stopping' || event.type === 'run.skipped') {
    return (
      <article className="event-entry system-entry warning">
        <span className="event-rail-icon"><CircleDot size={12} /></span>
        <span>{payload.message || payload.reason}</span>
      </article>
    );
  }

  if (event.type === 'run.completed') {
    const ok = payload.status === 'succeeded';
    return (
      <article className={`event-entry completion-entry ${ok ? 'ok' : 'not-ok'}`}>
        <span className="event-rail-icon">{ok ? <Check size={13} /> : <X size={13} />}</span>
        <div>
          <strong>{ok ? 'Run completed' : `Run ${payload.status}`}</strong>
          <span>{payload.error || `Codex exited with code ${payload.exitCode ?? 0}`}</span>
        </div>
      </article>
    );
  }

  if (event.type === 'tool.started' || event.type === 'tool.completed') {
    return (
      <article className="event-entry tool-entry">
        <span className="tool-glyph"><Wrench size={14} /></span>
        <div className="event-content">
          <div className="event-title">
            {payload.label || payload.tool}
            {event.type === 'tool.completed' && (
              <span className={`micro-result ${payload.code === 0 ? 'success' : 'failure'}`}>
                {payload.code === 0 ? 'completed' : `exit ${payload.code}`}
              </span>
            )}
          </div>
          {payload.output && <CodeOutput>{payload.output}</CodeOutput>}
        </div>
      </article>
    );
  }

  if (item?.type === 'agent_message') {
    return (
      <article className="event-entry assistant-message">
        <span className="event-avatar agent">CX</span>
        <div className="event-content">
          <div className="event-title"><MessageSquareText size={13} /> Codex</div>
          <p className="message-copy">{item.text}</p>
        </div>
      </article>
    );
  }

  if (item?.type === 'reasoning') {
    return (
      <article className="event-entry reasoning-entry">
        <span className="event-avatar reason"><BrainCircuit size={14} /></span>
        <div className="event-content">
          <div className="event-title">Reasoning</div>
          <p className="message-copy subdued-copy">{item.text}</p>
        </div>
      </article>
    );
  }

  if (item?.type === 'command_execution') {
    const status = item.status || (event.type === 'item.started' ? 'running' : 'completed');
    return (
      <article className="event-entry command-entry">
        <span className="tool-glyph command"><Terminal size={14} /></span>
        <div className="event-content">
          <div className="event-title">
            Command
            <span className={`micro-result ${item.exit_code === 0 ? 'success' : item.exit_code != null ? 'failure' : ''}`}>
              {item.exit_code != null ? `exit ${item.exit_code}` : status}
            </span>
          </div>
          <pre className="command-line"><span>$</span> {item.command}</pre>
          {item.aggregated_output && <CodeOutput>{item.aggregated_output}</CodeOutput>}
        </div>
      </article>
    );
  }

  if (item?.type === 'file_change') {
    const changes = item.changes || [];
    return (
      <article className="event-entry diff-entry">
        <span className="tool-glyph diff"><FileDiff size={14} /></span>
        <div className="event-content">
          <div className="event-title">File changes <span className="count-badge">{changes.length}</span></div>
          <div className="diff-list">
            {changes.map((change, index) => (
              <div className="diff-line" key={`${change.path}-${index}`}>
                <span className={`diff-kind ${change.kind || 'update'}`}>{change.kind === 'add' ? '+' : change.kind === 'delete' ? '−' : 'M'}</span>
                <span className="mono">{change.path}</span>
              </div>
            ))}
          </div>
        </div>
      </article>
    );
  }

  if (item?.type === 'mcp_tool_call') {
    return (
      <article className="event-entry tool-entry">
        <span className="tool-glyph"><Wrench size={14} /></span>
        <div className="event-content">
          <div className="event-title">MCP · {item.server}.{item.tool}</div>
          {(item.result || item.error) && <CodeOutput>{item.result || item.error}</CodeOutput>}
        </div>
      </article>
    );
  }

  if (item?.type === 'web_search') {
    return (
      <article className="event-entry tool-entry">
        <span className="tool-glyph"><Globe2 size={14} /></span>
        <div className="event-content">
          <div className="event-title">Web search</div>
          <span className="mono subtle">{item.query}</span>
        </div>
      </article>
    );
  }

  if (item?.type === 'todo_list') {
    return (
      <article className="event-entry todo-entry">
        <span className="tool-glyph"><ListChecks size={14} /></span>
        <div className="event-content">
          <div className="event-title">Plan</div>
          <div className="todo-list">
            {(item.items || []).map((todo, index) => (
              <div key={index} className={todo.completed ? 'complete' : ''}>
                <span>{todo.completed ? '✓' : '○'}</span> {todo.text}
              </div>
            ))}
          </div>
        </div>
      </article>
    );
  }

  if (item?.type === 'error' || event.type === 'error' || event.type === 'run.error') {
    return (
      <article className="event-entry error-entry">
        <span className="event-rail-icon"><X size={12} /></span>
        <span>{item?.message || payload.message || payload.error || 'Codex reported an error'}</span>
      </article>
    );
  }

  if (event.type === 'codex.stderr') {
    return (
      <article className="event-entry stderr-entry">
        <span className="event-rail-icon"><Terminal size={11} /></span>
        <span className="mono">{payload.message}</span>
      </article>
    );
  }

  if (event.type === 'thread.started' || event.type === 'turn.started' || event.type === 'turn.completed') {
    return (
      <article className="event-entry system-entry compact">
        <span className="event-rail-icon"><CircleDot size={10} /></span>
        <span>{event.type.replaceAll('.', ' ')}</span>
      </article>
    );
  }

  return (
    <details className="raw-event">
      <summary><ChevronDown size={13} /> {event.type} <span>seq {event.seq}</span></summary>
      <pre>{JSON.stringify(payload, null, 2)}</pre>
    </details>
  );
}

export default function EventTimeline({ events }) {
  const [filter, setFilter] = useState('all');
  const [follow, setFollow] = useState(true);
  const scroller = useRef(null);
  const filtered = events.filter((event) => filter === 'all' || eventKind(event) === filter);

  useEffect(() => {
    if (!follow || !scroller.current) return;
    scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [events, follow]);

  function handleScroll() {
    const node = scroller.current;
    if (!node) return;
    setFollow(node.scrollHeight - node.scrollTop - node.clientHeight < 90);
  }

  return (
    <section className="timeline-panel">
      <header className="timeline-header">
        <div>
          <h2>Activity <span>{events.length}</span></h2>
        </div>
        <div className="timeline-tools">
          <div className="trace-filter">
            {['all', 'messages', 'tools'].map((option) => (
              <button type="button" key={option} className={filter === option ? 'active' : ''} onClick={() => setFilter(option)}>
                {option}
              </button>
            ))}
          </div>
          {!follow && (
            <button type="button" className="follow-button" onClick={() => setFollow(true)}>
              <ChevronDown size={14} /> Jump to latest
            </button>
          )}
        </div>
      </header>
      <div className="timeline-scroll" ref={scroller} onScroll={handleScroll}>
        {filtered.length ? (
          <div className="timeline-list">
            {filtered.map((event) => <EventEntry key={`${event.id}-${event.seq}`} event={event} />)}
            {events.length > 0 && <div className="timeline-end"><span /><span>End of activity</span><span /></div>}
          </div>
        ) : (
          <div className="timeline-empty">
            <Search size={20} />
            <p>No {filter === 'all' ? '' : filter} events yet.</p>
          </div>
        )}
      </div>
    </section>
  );
}
