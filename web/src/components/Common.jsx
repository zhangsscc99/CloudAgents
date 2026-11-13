import { AlertTriangle, ArrowRight, LoaderCircle, RefreshCw } from 'lucide-react';
import { statusLabel } from '../utils.js';

export function StatusBadge({ status, pulse = false }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span className={`status-dot ${pulse || status === 'running' ? 'pulse' : ''}`} />
      {statusLabel(status)}
    </span>
  );
}

export function Loading({ label = 'Loading workspace…' }) {
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
