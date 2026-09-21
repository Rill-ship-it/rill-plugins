import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SAMPLE_USER, childEnv, fakeServer, run, tmpHome } from './helpers.mjs';

const signedIn = (t, creds = { token: 'tok_1', uid: 'u_cached', wallet: '0xabc' }) => {
  const home = tmpHome(t);
  writeFileSync(join(home, 'credentials.json'), JSON.stringify(creds));
  return home;
};

test('status --brief: NOT_SIGNED_IN without credentials, fast', async (t) => {
  const r = await run('rill.mjs', ['status', '--brief'], { env: childEnv(tmpHome(t)) });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, 'NOT_SIGNED_IN\n');
  assert.ok(r.ms < 1500, `took ${r.ms} ms`);
});

test('status --brief: exact SIGNED_IN line from /v1/me', async (t) => {
  const api = await fakeServer(t, (req) => {
    assert.equal(req.path, '/v1/me');
    assert.equal(req.headers.authorization, 'Bearer tok_1');
    return { body: { user: SAMPLE_USER } };
  });
  const r = await run('rill.mjs', ['status', '--brief'], { env: childEnv(signedIn(t), { RILL_API_BASE: api.url }) });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, 'SIGNED_IN uid=u_7k3m9qx2 daily=7/20\n');
});

test('status --brief: server hangs → cached uid with ?/? in under 2 s', async (t) => {
  const api = await fakeServer(t, () => ({ hang: true }));
  const r = await run('rill.mjs', ['status', '--brief'], { env: childEnv(signedIn(t), { RILL_API_BASE: api.url }) });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, 'SIGNED_IN uid=u_cached daily=?/?\n');
  assert.ok(r.ms < 2000, `must finish under 2 s, took ${r.ms} ms`);
});

test('status --brief: unreachable host → cached uid; rejected token → NOT_SIGNED_IN', async (t) => {
  const r = await run('rill.mjs', ['status', '--brief'], { env: childEnv(signedIn(t), { RILL_API_BASE: 'http://127.0.0.1:1' }) });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, 'SIGNED_IN uid=u_cached daily=?/?\n');

  const api = await fakeServer(t, () => ({ status: 401, body: { error: 'invalid_token' } }));
  const r2 = await run('rill.mjs', ['status', '--brief'], { env: childEnv(signedIn(t), { RILL_API_BASE: api.url }) });
  assert.equal(r2.code, 0);
  assert.equal(r2.stdout, 'NOT_SIGNED_IN\n');
});

test('status (full) shows Rill ID, wallet, progress, share mode', async (t) => {
  const api = await fakeServer(t, () => ({ body: { user: SAMPLE_USER } }));
  const home = signedIn(t);
  writeFileSync(join(home, 'config.json'), JSON.stringify({ share: 'meta' }));
  const r = await run('rill.mjs', ['status'], { env: childEnv(home, { RILL_API_BASE: api.url }) });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Rill ID\s+u_7k3m9qx2/);
  assert.match(r.stdout, new RegExp(SAMPLE_USER.wallet.address));
  assert.match(r.stdout, /Daily catch 7\/20 · finds 7 · analyses 1/);
  assert.match(r.stdout, /Share\s+meta/);
  assert.match(r.stdout, new RegExp(`API\\s+${api.url.replace(/[.:/]/g, '\\$&')}`));

  const r2 = await run('rill.mjs', ['status'], { env: childEnv(tmpHome(t)) });
  assert.equal(r2.code, 0);
  assert.match(r2.stdout, /\/rill:login/);
});

test('api base precedence: env > config.json > default', async (t) => {
  const api = await fakeServer(t, () => ({ body: { user: SAMPLE_USER } }));
  const home = signedIn(t);
  writeFileSync(join(home, 'config.json'), JSON.stringify({ api_base: api.url + '/' }));
  const r = await run('rill.mjs', ['status', '--brief'], { env: childEnv(home) });
  assert.equal(r.stdout, 'SIGNED_IN uid=u_7k3m9qx2 daily=7/20\n', 'config.json api_base used, trailing slash trimmed');
  assert.equal(api.requests[0].path, '/v1/me');
});
