import { useEffect, useState } from 'react';
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
    <div className="directory-picker">
      <input
        id={inputId}
        className="input mono"
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="/www/project"
        autoComplete="off"
        spellCheck="false"
        aria-label="Working directory"
        required={required}
        aria-describedby={`${listId}-hint`}
        aria-invalid={displayed && !displayed.checking && !displayed.exists ? 'true' : undefined}
      />
      <datalist id={listId}>
        {repos.map((repo) => (
          <option key={repo.path} value={repo.path} label={`${repo.name} — ${repo.path}`}>
            {repo.name} — {repo.path}
          </option>
        ))}
      </datalist>
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
