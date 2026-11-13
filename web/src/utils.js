export function formatDate(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...options,
  }).format(date);
}

export function formatRelative(value) {
  if (!value) return 'Never';
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const periods = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, threshold] of periods) {
    if (Math.abs(seconds) >= threshold) return formatter.format(Math.round(seconds / threshold), unit);
  }
  return formatter.format(seconds, 'second');
}

export function formatDuration(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remaining}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function runningDuration(run, now = Date.now()) {
  if (!run) return 0;
  if (run.status === 'running' && run.started_at) {
    return (run.duration_ms || 0) + Math.max(0, now - new Date(run.started_at).getTime());
  }
  return run.duration_ms || 0;
}

export function repoName(path) {
  return path?.split('/').filter(Boolean).pop() || path || 'Unknown';
}

export function statusLabel(status) {
  const labels = {
    running: 'Running',
    succeeded: 'Succeeded',
    failed: 'Failed',
    stopped: 'Stopped',
    skipped: 'Skipped',
    queued: 'Queued',
  };
  return labels[status] || status;
}

export function triggerLabel(run) {
  if (run.automation_name) return run.automation_name;
  return 'Manual agent';
}

export function eventText(value) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return JSON.stringify(value, null, 2);
}

export function trimOutput(value, max = 6000) {
  const text = eventText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n… ${text.length - max} more characters`;
}
