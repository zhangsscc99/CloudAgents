import { readdir, stat, realpath } from 'node:fs/promises';
import { join } from 'node:path';

const claimed = new Set(['/www', '/root']);
const ignored = new Set(['node_modules', '.git', '.cache', '.npm', 'snap', 'proc', 'sys']);

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function hasGit(path) {
  return isDirectory(join(path, '.git')).catch(() => false);
}

export async function discoverRepos() {
  const repos = [];
  const seen = new Set();

  for (const root of ['/www', '/root']) {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (ignored.has(entry.name) || entry.name.startsWith('.')) continue;
      const candidate = join(root, entry.name);
      if (!(await isDirectory(candidate))) continue;

      let actual;
      try {
        actual = await realpath(candidate);
      } catch {
        continue;
      }
      if (seen.has(actual)) continue;
      seen.add(actual);
      repos.push({
        name: entry.name,
        path: actual,
        displayPath: candidate,
        root,
        isGit: await hasGit(actual),
      });
    }
  }

  return repos.sort((a, b) => {
    if (a.isGit !== b.isGit) return a.isGit ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function assertAllowedRepo(repoDir) {
  if (typeof repoDir !== 'string' || !repoDir.startsWith('/')) {
    throw new Error('Repository must be an absolute path');
  }
  if (!repoDir.startsWith('/www/') && !repoDir.startsWith('/root/')) {
    throw new Error('Repository must be a project directory inside /www or /root');
  }
}

export async function validateRepo(repoDir) {
  assertAllowedRepo(repoDir);
  let actual;
  try {
    actual = await realpath(repoDir);
  } catch {
    throw new Error('Repository directory does not exist');
  }
  assertAllowedRepo(actual);
  if (!(await isDirectory(actual))) {
    throw new Error('Repository path is not a directory');
  }
  return actual;
}

export async function checkRepo(repoDir) {
  try {
    assertAllowedRepo(repoDir);
    const actual = await realpath(repoDir);
    if (!(await isDirectory(actual))) return { exists: false, isGit: false };
    return { exists: true, isGit: await hasGit(actual) };
  } catch {
    return { exists: false, isGit: false };
  }
}
