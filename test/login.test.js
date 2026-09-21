import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SAMPLE_USER, childEnv, fakeServer, run, tmpHome } from './helpers.mjs';

const START = { device_code: 'dc_secret_1', user_code: 'K7MX-4Q2P', verify_url: 'https://app.rill.land/#/link?code=K7MX-4Q2P', expires_in: 600, interval: 0.05 };

/** Device-flow fake: approve on the third poll (two pendings first). */
function deviceApi({ outcome = 'approved', pendingPolls = 2 } = {}) {
  let polls = 0;
  return (req) => {
    if (req.path === '/v1/device/start' && req.method === 'POST') {
      assert.equal(req.json.client, 'claude-code');
      assert.match(req.json.version, /^\d+\.\d+\.\d+$/);
      assert.ok(typeof req.json.label === 'string' && req.json.label.length > 0);
      return { body: START };
    }
    if (req.path === '/v1/device/poll' && req.method === 'POST') {
      assert.equal(req.json.device_code, START.device_code);
      polls++;
      if (polls <= pendingPolls) return { body: { status: 'pending' } };
      if (outcome === 'approved') return { body: { status: 'approved', token: 'tok_claude_1', user: SAMPLE_USER } };
      return { body: { status: outcome } };
    }
    if (req.path === '/v1/auth/logout') return { body: { ok: true } };
    return { status: 404, body: { error: 'not_found' } };
  };
}

test('login: start → two pending polls → approved → credentials (0600) + uid, wallet, progress, privacy notice', async (t) => {
  const home = tmpHome(t);
  const api = await fakeServer(t, deviceApi());
  const r = await run('rill.mjs', ['login', '--no-browser'], { env: childEnv(home, { RILL_API_BASE: api.url }) });
  assert.equal(r.code, 0, r.stderr);

  const polls = api.requests.filter((q) => q.path === '/v1/device/poll');
  assert.equal(polls.length, 3);
  assert.equal(api.requests[0].path, '/v1/device/start');

  const credsPath = join(home, 'credentials.json');
  assert.equal(statSync(credsPath).mode & 0o777, 0o600);
  const creds = JSON.parse(readFileSync(credsPath, 'utf8'));
  assert.equal(creds.token, 'tok_claude_1');
  assert.equal(creds.uid, 'u_7k3m9qx2');
  assert.equal(creds.wallet, SAMPLE_USER.wallet.address);
  assert.equal(creds.api_base, api.url);

  assert.match(r.stdout, /K7MX-4Q2P/);
  assert.match(r.stdout, /app\.rill\.land\/#\/link\?code=K7MX-4Q2P/);
  assert.match(r.stdout, /Rill ID\s+u_7k3m9qx2/);
  assert.match(r.stdout, new RegExp(SAMPLE_USER.wallet.address));
  assert.match(r.stdout, /Daily catch 7\/20/);
  assert.match(r.stdout, /finds 7/);
  assert.match(r.stdout, /Privacy/);
  assert.match(r.stdout, /"share": "full" \| "meta"/);
  assert.match(r.stdout, /隐私说明/);
  assert.match(r.stdout, /Never collected/);
});

test('login --start prints link + code and the exact --wait command; --wait completes the flow', async (t) => {
  const home = tmpHome(t);
  const api = await fakeServer(t, deviceApi());
  const env = childEnv(home, { RILL_API_BASE: api.url });

  const s = await run('rill.mjs', ['login', '--start', '--no-browser'], { env });
  assert.equal(s.code, 0, s.stderr);
  assert.match(s.stdout, /Code: K7MX-4Q2P/);
  const waitLine = s.stdout.split('\n').find((l) => l.includes('login --wait'));
  assert.ok(waitLine, 'wait command printed');
  assert.match(waitLine, /--device-code dc_secret_1 --interval 0\.05 --expires-in 600/);
  assert.equal(existsSync(join(home, 'credentials.json')), false, 'nothing saved yet');

  const w = await run('rill.mjs', ['login', '--wait', '--device-code', 'dc_secret_1', '--interval', '0.05', '--expires-in', '600'], { env });
  assert.equal(w.code, 0, w.stderr);
  assert.match(w.stdout, /Rill ID\s+u_7k3m9qx2/);
  assert.equal(JSON.parse(readFileSync(join(home, 'credentials.json'), 'utf8')).token, 'tok_claude_1');
});

test('login: denied → exit 1, no credentials; slow_down backs off and keeps polling', async (t) => {
  const home = tmpHome(t);
  const api = await fakeServer(t, deviceApi({ outcome: 'denied' }));
  const r = await run('rill.mjs', ['login', '--no-browser'], { env: childEnv(home, { RILL_API_BASE: api.url }) });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /denied/i);
  assert.equal(existsSync(join(home, 'credentials.json')), false);

  let polls = 0;
  const throttled = await fakeServer(t, (req) => {
    if (req.path === '/v1/device/start') return { body: { ...START, interval: 0.01 } };
    polls++;
    if (polls === 1) return { status: 429, body: { error: 'slow_down' } };
    return { body: { status: 'approved', token: 'tok_2', user: SAMPLE_USER } };
  });
  const r2 = await run('rill.mjs', ['login', '--no-browser'], { env: childEnv(tmpHome(t), { RILL_API_BASE: throttled.url }), timeoutMs: 20_000 });
  assert.equal(r2.code, 0, r2.stderr);
  assert.equal(polls, 2);
  assert.ok(r2.ms >= 5000, `slow_down adds 5 s before the next poll (took ${r2.ms} ms)`);
});

test('logout revokes the token and forgets it; logout when signed out is a no-op', async (t) => {
  const home = tmpHome(t);
  const api = await fakeServer(t, deviceApi());
  writeFileSync(join(home, 'credentials.json'), JSON.stringify({ token: 'tok_x', uid: 'u_x' }));
  const r = await run('rill.mjs', ['logout'], { env: childEnv(home, { RILL_API_BASE: api.url }) });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Signed out of Rill \(u_x\)/);
  assert.equal(existsSync(join(home, 'credentials.json')), false);
  const out = api.requests.find((q) => q.path === '/v1/auth/logout');
  assert.equal(out.headers.authorization, 'Bearer tok_x');

  const r2 = await run('rill.mjs', ['logout'], { env: childEnv(home, { RILL_API_BASE: api.url }) });
  assert.equal(r2.code, 0);
  assert.match(r2.stdout, /Not signed in/);
});

test('open prints the dashboard URL (browser suppressed in tests)', async (t) => {
  const r = await run('rill.mjs', ['open'], { env: childEnv(tmpHome(t), { RILL_APP_BASE: 'https://app.example.test/' }) });
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), 'https://app.example.test');
});
