import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  FolderGit2,
  Search,
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  const filteredRepos = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((repo) =>
      repo.path.toLowerCase().includes(q) || String(repo.name || '').toLowerCase().includes(q));
  }, [repos, query]);

  const customPath = query.trim();
  const canUseCustom = customPath.length > 0
    && !repos.some((repo) => repo.path === customPath);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setHighlight(0);
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const selectRepo = (path) => {
    onChange(path);
    setOpen(false);
  };

  const onSearchKeyDown = (event) => {
    const count = filteredRepos.length + (canUseCustom ? 1 : 0);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((current) => (current + delta + count) % Math.max(count, 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (filteredRepos[highlight]) selectRepo(filteredRepos[highlight].path);
      else if (canUseCustom) selectRepo(customPath);
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
    if (known) {
      setDirectory({ exists: true, isGit: known.isGit, checking: false });
      return undefined;
    }
    setDirectory({ exists: false, isGit: false, checking: true });

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

  const displayed = directory;
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
        className="input mono directory-display"
        value={value}
        readOnly
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
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
        <div className="directory-menu" id={`${listId}-menu`}>
          <div className="directory-search">
            <Search size={13} />
            <input
              ref={searchRef}
              className="directory-search-input mono"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlight(0);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder="Search directories…"
              spellCheck="false"
              autoComplete="off"
            />
          </div>
          <div className="directory-list" role="listbox">
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
            {canUseCustom && (
              <button
                type="button"
                role="option"
                aria-selected="false"
                className={`directory-option${highlight === filteredRepos.length ? ' is-active' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectRepo(customPath);
                }}
                onMouseEnter={() => setHighlight(filteredRepos.length)}
              >
                <span className="directory-option-name">Use custom path</span>
                <span className="directory-option-path mono">{customPath}</span>
              </button>
            )}
            {filteredRepos.length === 0 && !canUseCustom && (
              <div className="directory-empty">No directories found.</div>
            )}
          </div>
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

export function SearchableSelect({
  options = [],
  value = '',
  onChange,
  placeholder = 'Select…',
  inputId = 'searchable-select',
  ariaLabel = 'Select option',
  allowCustom = true,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.toLowerCase().includes(q));
  }, [options, query]);

  const custom = query.trim();
  const canUseCustom = allowCustom && custom.length > 0 && !options.includes(custom);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setHighlight(0);
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const select = (option) => {
    onChange(option);
    setOpen(false);
  };

  const onSearchKeyDown = (event) => {
    const count = filtered.length + (canUseCustom ? 1 : 0);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((current) => (current + delta + count) % Math.max(count, 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (filtered[highlight]) select(filtered[highlight]);
      else if (canUseCustom) select(custom);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="directory-picker" ref={rootRef}>
      <input
        id={inputId}
        className="input directory-display"
        value={value}
        readOnly
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck="false"
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
      />
      {open && (
        <div className="directory-menu">
          <div className="directory-search">
            <Search size={13} />
            <input
              ref={searchRef}
              className="directory-search-input"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlight(0);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder="Search…"
              spellCheck="false"
              autoComplete="off"
            />
          </div>
          <div className="directory-list" role="listbox">
            {filtered.map((option, index) => (
              <button
                type="button"
                key={option}
                role="option"
                aria-selected={option === value}
                className={`directory-option${index === highlight ? ' is-active' : ''}${option === value ? ' is-selected' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  select(option);
                }}
                onMouseEnter={() => setHighlight(index)}
              >
                <span className="directory-option-name">{option}</span>
              </button>
            ))}
            {canUseCustom && (
              <button
                type="button"
                role="option"
                aria-selected="false"
                className={`directory-option${highlight === filtered.length ? ' is-active' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  select(custom);
                }}
                onMouseEnter={() => setHighlight(filtered.length)}
              >
                <span className="directory-option-name">Use custom value</span>
                <span className="directory-option-path mono">{custom}</span>
              </button>
            )}
            {filtered.length === 0 && !canUseCustom && (
              <div className="directory-empty">No options found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
