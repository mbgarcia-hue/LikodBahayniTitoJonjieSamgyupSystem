import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('an occupied API port reports a startup failure instead of claiming to be listening', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'restaurant-startup-'));
  const blocker = createServer();
  await new Promise(resolve => blocker.listen(0, '0.0.0.0', resolve));
  const port = blocker.address().port;
  let child;
  try {
    child = spawn(process.execPath, ['server/index.js'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, PORT: String(port), DATABASE_PATH: join(dir, 'startup.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error('API did not exit after a port conflict')); }, 15000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', code => { clearTimeout(timer); resolve(code); });
    });
    assert.equal(code, 1);
    assert.match(stderr, new RegExp(`port ${port} is already in use`));
    assert.doesNotMatch(stdout, /Restaurant API listening/);
  } finally {
    if (child && child.exitCode === null) {
      const stopped = new Promise(resolve => child.once('close', resolve));
      child.kill();
      await stopped;
    }
    await new Promise(resolve => blocker.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
