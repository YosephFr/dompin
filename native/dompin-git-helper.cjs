#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const os = require('node:os');

let input = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  input = Buffer.concat([input, chunk]);
  readMessages();
});

process.stdin.on('end', () => {
  process.exit(0);
});

function readMessages() {
  while (input.length >= 4) {
    const size = input.readUInt32LE(0);
    if (input.length < size + 4) return;
    const body = input.slice(4, size + 4).toString('utf8');
    input = input.slice(size + 4);
    Promise.resolve()
      .then(() => handle(JSON.parse(body)))
      .then(writeMessage)
      .catch((error) => writeMessage({ ok: false, error: errorMessage(error) }));
  }
}

function writeMessage(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

function handle(message) {
  if (!message || typeof message !== 'object') throw new Error('Invalid message.');
  if (message.kind === 'status') return status();
  if (message.kind === 'commit-session') return commitSession(message);
  throw new Error('Unsupported message kind.');
}

function status() {
  return {
    ok: true,
    status: 'ready',
    git: exec('git', ['--version']).trim(),
  };
}

function commitSession(message) {
  const sessionPath = resolveSessionPath(message);
  ensureGitRepository(sessionPath);
  ensureGitIdentity(sessionPath);
  git(sessionPath, ['add', '-A']);
  const statusText = git(sessionPath, ['status', '--porcelain']);
  if (!statusText.trim()) return { ok: true, status: 'clean' };
  git(sessionPath, ['commit', '-m', commitMessage(message.message)]);
  const commit = git(sessionPath, ['rev-parse', '--short', 'HEAD']).trim();
  return { ok: true, status: 'committed', commit };
}

function resolveSessionPath(message) {
  const vaultPath = typeof message.vaultPath === 'string' ? message.vaultPath.trim() : '';
  const vaultName = typeof message.vaultName === 'string' ? message.vaultName.trim() : '';
  const domainFolder = requiredString(message.domainFolder, 'domainFolder');
  const sessionFolder = requiredString(message.sessionFolder, 'sessionFolder');
  const root = resolveVaultRoot(vaultPath, vaultName);
  const sessionPath = path.resolve(root, domainFolder, sessionFolder);
  const rel = path.relative(root, sessionPath);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error('Session path escapes the configured vault.');
  }
  const stat = fs.statSync(sessionPath, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) throw new Error('Session folder does not exist.');
  return sessionPath;
}

function resolveVaultRoot(vaultPath, vaultName) {
  if (vaultPath) return path.resolve(expandHome(vaultPath));
  if (!vaultName) throw new Error('vaultPath or vaultName is required.');
  const candidates = [
    path.join(os.homedir(), vaultName),
    path.join(os.homedir(), 'Desktop', vaultName),
    path.join(os.homedir(), 'Documents', vaultName),
    path.join(os.homedir(), 'Downloads', vaultName),
  ];
  for (const candidate of candidates) {
    const stat = fs.statSync(candidate, { throwIfNoEntry: false });
    if (stat?.isDirectory()) return path.resolve(candidate);
  }
  throw new Error(
    `Could not find vault folder "${vaultName}". Set the absolute vault path in DOMPin Options.`,
  );
}

function ensureGitRepository(sessionPath) {
  try {
    git(sessionPath, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    git(sessionPath, ['init']);
  }
}

function ensureGitIdentity(sessionPath) {
  try {
    git(sessionPath, ['config', 'user.name']);
  } catch {
    git(sessionPath, ['config', 'user.name', 'DOMPin']);
  }
  try {
    git(sessionPath, ['config', 'user.email']);
  } catch {
    git(sessionPath, ['config', 'user.email', 'dompin@local.invalid']);
  }
}

function git(cwd, args) {
  return exec('git', ['-C', cwd, ...args]);
}

function exec(file, args) {
  return childProcess.execFileSync(file, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function commitMessage(value) {
  if (typeof value !== 'string') return 'Update DOMPin session';
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, 180) : 'Update DOMPin session';
}

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

function expandHome(value) {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

function errorMessage(error) {
  if (error && typeof error === 'object' && 'stderr' in error && error.stderr) {
    return String(error.stderr).trim();
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
