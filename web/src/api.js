async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

export function automationPayload(automation, overrides = {}) {
  return {
    name: automation.name,
    repoDir: automation.repo_dir,
    instructions: automation.instructions,
    model: automation.model,
    effort: automation.effort,
    enabled: automation.enabled,
    tool_push_branch: automation.tool_push_branch,
    memories_enabled: automation.memories_enabled,
    memory_notes: automation.memory_notes || '',
    triggers: automation.triggers.map((trigger) => ({
      id: trigger.id,
      type: trigger.type,
      expression: trigger.expression,
      timezone: trigger.timezone,
      enabled: trigger.enabled,
    })),
    ...overrides,
  };
}
