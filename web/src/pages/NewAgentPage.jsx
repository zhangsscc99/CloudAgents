import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Code2,
  FolderGit2,
  Play,
  ShieldAlert,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { api } from '../api.js';
import { useRemote } from '../hooks.js';
import { repoName } from '../utils.js';
import { ErrorState, Loading, RepoDirectoryField, Segmented, Toggle } from '../components/Common.jsx';

const effortCopy = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
};

export default function NewAgentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const config = useRemote('/api/config');
  const repos = useRemote('/api/repos');
  const [form, setForm] = useState({
    repoDir: searchParams.get('repo') || '',
    prompt: '',
    model: '',
    effort: '',
    bypassSandbox: true,
    skipGitRepoCheck: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!config.data || form.model) return;
    setForm((current) => ({
      ...current,
      model: config.data.defaults.model,
      effort: config.data.defaults.effort,
    }));
  }, [config.data, form.model]);

  useEffect(() => {
    if (!repos.data || form.repoDir) return;
    const firstRepo = repos.data.repos.find((repo) => repo.isGit)?.path || repos.data.repos[0]?.path || '';
    setForm((current) => ({ ...current, repoDir: firstRepo }));
  }, [repos.data, form.repoDir]);

  const selectedRepo = useMemo(
    () => repos.data?.repos?.find((repo) => repo.path === form.repoDir),
    [repos.data, form.repoDir],
  );

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await api.post('/api/runs', form);
      navigate(`/runs/${result.run.id}`);
    } catch (submitError) {
      setError(submitError.message);
      setSubmitting(false);
    }
  }

  if ((config.loading || repos.loading) && !config.data) return <Loading label="Loading agent settings…" />;
  if ((config.error && !config.data) || (repos.error && !repos.data)) {
    return <ErrorState message={config.error || repos.error} />;
  }

  return (
    <div className="page narrow-page">
      <button type="button" className="back-link reveal" onClick={() => navigate('/agents')}>
        <ArrowLeft size={15} /> Agents
      </button>
      <header className="editor-heading reveal">
        <h1>New agent</h1>
        <p>Run Codex in a repository on this machine.</p>
      </header>

      <form className="agent-composer reveal delay-1" onSubmit={submit}>
        <div className="composer-topline">
          <span>Prompt</span>
          <span className="composer-separator" />
          <span className="mono">{repoName(form.repoDir) || 'No repository selected'}</span>
        </div>
        <textarea
          className="prompt-textarea"
          value={form.prompt}
          onChange={(event) => update('prompt', event.target.value)}
          placeholder="Describe the task and expected result."
          rows={7}
          autoFocus
          required
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.currentTarget.form.requestSubmit();
            }
          }}
        />
        <div className="composer-footer">
          <span className="char-count">{form.prompt.length.toLocaleString()} chars</span>
          <button className="button primary run-submit" type="submit" disabled={submitting || !form.prompt.trim()}>
            {submitting ? <span className="button-spinner" /> : <Play size={15} fill="currentColor" />}
            {submitting ? 'Starting agent…' : 'Start agent'}
            <kbd>⌘ ↵</kbd>
          </button>
        </div>
      </form>

      {error && <div className="inline-error">{error}</div>}

      <div className="agent-config-grid reveal delay-2">
        <div className="config-panel">
          <div className="panel-label"><FolderGit2 size={15} /> Working directory</div>
          <RepoDirectoryField
            repos={repos.data?.repos || []}
            value={form.repoDir}
            onChange={(value) => update('repoDir', value)}
            inputId="new-agent-repo-directory"
            listId="new-agent-repo-options"
            required
          />
        </div>

        <div className="config-panel">
          <div className="panel-label"><Sparkles size={15} /> Model</div>
          <input
            className="input"
            list="model-options"
            value={form.model}
            onChange={(event) => update('model', event.target.value)}
            required
          />
          <datalist id="model-options">
            {config.data?.models?.map((model) => <option key={model} value={model} />)}
          </datalist>
          <div className="input-hint">Use a preset or enter any model ID.</div>
        </div>

        <div className="config-panel full-span">
          <div className="panel-label"><Code2 size={15} /> Reasoning effort</div>
          <Segmented
            options={config.data?.efforts || []}
            value={form.effort}
            onChange={(value) => update('effort', value)}
            name="Reasoning effort"
          />
          <div className="effort-labels">
            {(config.data?.efforts || []).map((effort) => <span key={effort}>{effortCopy[effort]}</span>)}
          </div>
        </div>
      </div>

      <details className="advanced-panel reveal delay-3">
        <summary><ShieldAlert size={15} /> Execution options <span>Advanced</span></summary>
        <div className="advanced-body">
          <Toggle
            checked={form.bypassSandbox}
            onChange={(value) => update('bypassSandbox', value)}
            label="Bypass approvals and sandbox"
            description="Runs with --dangerously-bypass-approvals-and-sandbox."
          />
          <Toggle
            checked={form.skipGitRepoCheck}
            onChange={(value) => update('skipGitRepoCheck', value)}
            label="Allow non-Git directories"
            description="Adds --skip-git-repo-check when the folder is not a repository."
          />
        </div>
      </details>

      <aside className="execution-plan reveal delay-3">
        <div className="plan-heading"><Terminal size={15} /><span>Command preview</span></div>
        <div className="plan-command mono">
          <span className="prompt-mark">$</span>
          <div>
            codex exec --json {form.bypassSandbox && '--dangerously-bypass-approvals-and-sandbox '}
            -C {form.repoDir || '<repo>'} -m {form.model || '<model>'} -c
            model_reasoning_effort={form.effort || 'medium'} “{form.prompt.slice(0, 55) || '<prompt>'}{form.prompt.length > 55 ? '…' : ''}”
          </div>
        </div>
        <div className="plan-foot">
          <span>{selectedRepo ? repoName(selectedRepo.path) : 'Repository pending'}</span>
          <span>{form.effort || 'medium'} effort</span>
        </div>
      </aside>
    </div>
  );
}
