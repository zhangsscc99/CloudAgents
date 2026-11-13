import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  FolderGit2,
  LoaderCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { api } from '../api.js';
import { statusLabel } from '../utils.js';

export function StatusBadge({ status, pulse = false }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span className={`status-dot ${pulse || status === 'running' ? 'pulse' : ''}`} />
      {statusLabel(status)}
    </span>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="loading-state">
      <span className="loader-orbit"><LoaderCircle size={22} /></span>
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="error-state">
      <AlertTriangle size={20} />
      <div>
        <strong>Couldn’t load this view</strong>
        <p>{message}</p>
      </div>
      {onRetry && (
        <button type="button" className="button secondary small" onClick={onRetry}>
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action, actionLabel }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{Icon && <Icon size={24} />}</span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action && (
        <button type="button" className="text-action" onClick={action}>
          {actionLabel} <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label className={`toggle-row ${disabled ? 'disabled' : ''}`}>
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span className="toggle-track"><span /></span>
    </label>
  );
}

export function Segmented({ options, value, onChange, name }) {
  return (
    <div className="segmented" role="group" aria-label={name}>
      {options.map((option) => (
        <button
          type="button"
          key={option}
          className={value === option ? 'selected' : ''}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function RepoDirectoryField({
  repos = [],
  value = '',
  onChange,
  inputId = 'repo-directory',
  listId = 'repo-options',
  required = false,
}) {
  const [directory, setDirectory] = useState(null);
  const listed = repos.find((repo) => repo.path === value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);

  const filteredRepos = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return repos;
    const exact = repos.some((repo) => repo.path === value.trim());
    if (exact) return repos;
    return repos.filter((repo) =>
      repo.path.toLowerCase().includes(query) || String(repo.name || '').toLowerCase().includes(query));
  }, [repos, value]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const selectRepo = (path) => {
    onChange(path);
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setHighlight((current) => {
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        return (current + delta + filteredRepos.length) % Math.max(filteredRepos.length, 1);
      });
    } else if (event.key === 'Enter' && open && filteredRepos[highlight]) {
      event.preventDefault();
      selectRepo(filteredRepos[highlight].path);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  useEffect(() => {
    const path = value.trim();
    if (!path) {
      setDirectory(null);
      return undefined;
    }

    const known = repos.find((repo) => repo.path === path);
    setDirectory(known
      ? { exists: true, isGit: known.isGit, checking: true }
      : { exists: false, isGit: false, checking: true });

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.get(`/api/repos/check?${new URLSearchParams({ path })}`);
        if (!cancelled) setDirectory({ ...result, checking: false });
      } catch {
        if (!cancelled) setDirectory({ exists: false, isGit: false, checking: false, failed: true });
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [repos, value]);

  const displayed = listed && (!directory || directory.checking)
    ? { exists: true, isGit: listed.isGit, checking: false }
    : directory;
  const hintClass = displayed?.failed || (displayed && !displayed.checking && !displayed.exists)
    ? 'is-error'
    : displayed?.exists && displayed.isGit
      ? 'is-success'
      : 'is-neutral';

  let hint = 'Choose a discovered directory or enter an absolute path.';
  if (displayed?.checking) {
    hint = 'Checking directory…';
  } else if (displayed?.failed) {
    hint = 'Could not check this directory.';
  } else if (displayed && !displayed.exists) {
    hint = 'Directory not found.';
  } else if (displayed?.isGit) {
    hint = 'Git repository detected';
  } else if (displayed?.exists) {
    hint = 'Directory detected';
  }

  return (
    <div className="directory-picker" ref={rootRef}>
      <input
        id={inputId}
        className="input mono"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="/www/project"
        autoComplete="off"
        spellCheck="false"
        aria-label="Working directory"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${listId}-menu`}
        required={required}
        aria-describedby={`${listId}-hint`}
        aria-invalid={displayed && !displayed.checking && !displayed.exists ? 'true' : undefined}
      />
      {open && (
        <div className="directory-menu" id={`${listId}-menu`} role="listbox">
          {filteredRepos.length === 0 && (
            <div className="directory-empty">No matching directories. Path is used as typed.</div>
          )}
          {filteredRepos.map((repo, index) => (
            <button
              type="button"
              key={repo.path}
              role="option"
              aria-selected={repo.path === value}
              className={`directory-option${index === highlight ? ' is-active' : ''}${repo.path === value ? ' is-selected' : ''}`}
              onMouseDown={(event) => {
                event.preventDefault();
                selectRepo(repo.path);
              }}
              onMouseEnter={() => setHighlight(index)}
            >
              <span className="directory-option-name">
                <FolderGit2 size={13} />
                {repo.name}
                {repo.isGit && <span className="directory-option-badge">git</span>}
              </span>
              <span className="directory-option-path mono">{repo.path}</span>
            </button>
          ))}
        </div>
      )}
      <div id={`${listId}-hint`} className={`input-hint directory-hint ${hintClass}`}>
        {displayed && !displayed.checking && displayed.isGit && (
          <span className="mini-check"><Check size={11} /></span>
        )}
        {displayed && !displayed.checking && displayed.exists && !displayed.isGit && (
          <FolderGit2 size={12} />
        )}
        {displayed && !displayed.checking && !displayed.exists && <XCircle size={12} />}
        {hint}
      </div>
    </div>
  );
}

export function PageIntro({ eyebrow, title, description, actions }) {
  return (
    <header className="page-intro reveal">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="intro-actions">{actions}</div>}
    </header>
  );
}
