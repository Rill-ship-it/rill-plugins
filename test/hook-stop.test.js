import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SAMPLE_USER, childEnv, fakeServer, run, tmpHome } from './helpers.mjs';

function setup(t, { creds = { token: 'tok_1', uid: 'u_7k3m9qx2' }, share } = {}) {
  const home = tmpHome(t);
  mkdirSync(join(home, 'turns'), { recursive: true });
  if (creds) writeFileSync(join(home, 'credentials.json'), JSON.stringify(creds));
  if (share) writeFileSync(join(home, 'config.json'), JSON.stringify({ share }));
  return home;
}

const turnFile = (home, sid) => join(home, 'turns', `${sid}.json`);
const writeTurn = (home, sid, turn) => writeFileSync(turnFile(home, sid), JSON.stringify({ prompt_id: 'p1', prompt: 'BTC 现在怎么样', at: '2026-09-21T06:00:00Z', calls: [], record: null, ...turn }));
const stopInput = (sid, extra = {}) => ({ session_id: sid, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'BTC is crowded-long.', ...extra });

const analysesOk = (find = { counts: true, reason: 'ok' }) => ({
  body: { analysis: { id: 'ana_1', find }, user: SAMPLE_USER, catch: SAMPLE_USER.catches.daily },
});

test('sends the §5.2 body, deletes the turn file, prints the counted line', async (t) => {
  const home = setup(t);
  const api = await fakeServer(t, () => analysesOk());
  writeTurn(home, 's1', {
    calls: [{ venue: 'hyperliquid', command: 'snapshot', symbol: 'BTC', at: '2026-09-21T06:00:01Z' }],
    record: { schema: 'rill.analysis/1', venue: 'hyperliquid', symbols: ['btc'], command: 'analysis', read: { state: 'crowded-long', bias: 'neutral', summary: 's' } },
  });
  const r = await run('hook-stop.mjs', [], { env: childEnv(home, { RILL_API_BASE: api.url }), input: stopInput('s1') });
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(r.stdout), { systemMessage: 'Rill · BTC analysis counted · Daily catch 7/20' });
  assert.equal(existsSync(turnFile(home, 's1')), false);

  assert.equal(api.requests.length, 1);
  const req = api.requests[0];
  assert.equal(req.method, 'POST');
  assert.equal(req.path, '/v1/analyses');
  assert.equal(req.headers.authorization, 'Bearer tok_1');
  const b = req.json;
  assert.equal(b.session_id, 's1');
  assert.equal(b.prompt_id, 'p1');
  assert.equal(b.venue, 'hyperliquid');
  assert.equal(b.command, 'analysis');
  assert.deepEqual(b.symbols, ['BTC']);
  assert.equal(b.prompt, 'BTC 现在怎么样');
  assert.equal(b.response, 'BTC is crowded-long.');
  assert.equal(b.calls.length, 1);
  assert.equal(b.record.read.state, 'crowded-long');
  assert.match(b.plugin_version, /^\d+\.\d+\.\d+$/);
  assert.equal(b.client.os, process.platform);
  assert.equal(b.client.node, process.versions.node);
  assert.equal(b.share, 'full');
});

test('derives command and symbols from calls when there is no record', async (t) => {
  const home = setup(t);
  const api = await fakeServer(t, () => analysesOk());
  writeTurn(home, 's2', {
    calls: [
      { venue: 'hyperliquid', command: 'predicted', symbol: null, at: 'x' },
      { venue: 'hyperliquid', command: 'funding', symbol: 'ETH', at: 'x' },
      { venue: 'hyperliquid', command: 'funding', symbol: 'eth', at: 'x' },
    ],
  });
  const r = await run('hook-stop.mjs', [], { env: childEnv(home, { RILL_API_BASE: api.url }), input: stopInput('s2') });
  assert.equal(r.code, 0);
  const b = api.requests[0].json;
  assert.equal(b.command, 'funding');
  assert.deepEqual(b.symbols, ['ETH']);
  assert.equal(b.record, null);
  assert.deepEqual(JSON.parse(r.stdout), { systemMessage: 'Rill · ETH funding counted · Daily catch 7/20' });
});

test('messages for seen_before, plugin_cap, not_counted_command', async (t) => {
  const cases = [
    [{ counts: false, reason: 'seen_before' }, 'Rill · BTC analysis seen today · Daily catch 7/20'],
    [{ counts: false, reason: 'plugin_cap' }, 'Rill · BTC analysis daily cap reached · Daily catch 7/20'],
    [{ counts: false, reason: 'not_counted_command' }, null],
  ];
  for (const [find, expected] of cases) {
    const home = setup(t);
    const api = await fakeServer(t, () => analysesOk(find));
    writeTurn(home, 's3', { calls: [{ venue: 'hyperliquid', command: 'snapshot', symbol: 'BTC', at: 'x' }] });
    const r = await run('hook-stop.mjs', [], { env: childEnv(home, { RILL_API_BASE: api.url }), input: stopInput('s3') });
    assert.equal(r.code, 0);
    if (expected) assert.deepEqual(JSON.parse(r.stdout), { systemMessage: expected });
    else assert.equal(r.stdout, '');
    assert.equal(existsSync(turnFile(home, 's3')), false);
    await api.close();
  }
});

test('share=meta omits prompt and response but still sends', async (t) => {
  const home = setup(t, { share: 'meta' });
  const api = await fakeServer(t, () => analysesOk());
  writeTurn(home, 's4', { calls: [{ venue: 'hyperliquid', command: 'book', symbol: 'HYPE', at: 'x' }] });
  const r = await run('hook-stop.mjs', [], { env: childEnv(home, { RILL_API_BASE: api.url }), input: stopInput('s4') });
  assert.equal(r.code, 0);
  const b = api.requests[0].json;
  assert.equal('prompt' in b, false);
  assert.equal('response' in b, false);
  assert.equal(b.share, 'meta');
  assert.equal(b.command, 'book');
  assert.deepEqual(b.symbols, ['HYPE']);
});

test('prompt and response are capped at 32 KB', async (t) => {
  const home = setup(t);
  const api = await fakeServer(t, () => analysesOk());
  writeTurn(home, 's5', { prompt: '问'.repeat(20_000), calls: [{ venue: 'hyperliquid', command: 'snapshot', symbol: 'BTC', at: 'x' }] });
  const r = await run('hook-stop.mjs', [], { env: childEnv(home, { RILL_API_BASE: api.url }), input: stopInput('s5', { last_assistant_message: 'a'.repeat(50_000) }) });
  assert.equal(r.code, 0);
  const b = api.requests[0].json;
  assert.ok(Buffer.byteLength(b.prompt) <= 32 * 1024);
  assert.ok(Buffer.byteLength(b.prompt) > 32 * 1024 - 3, 'cut on a character boundary, not far below');
  assert.equal(b.response.length, 32 * 1024);
});

test('silent exits: stop_hook_active, no turn, no calls, not signed in', async (t) => {
  const api = await fakeServer(t, () => analysesOk());

  let home = setup(t);
  writeTurn(home, 'a', { calls: [{ venue: 'hyperliquid', command: 'snapshot', symbol: 'BTC', at: 'x' }] });
  let r = await run('hook-stop.mjs', [], { env: childEnv(home, { RILL_API_BASE: api.url }), input: stopInput('a', { stop_hook_active: true }) });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(existsSync(turnFile(home, 'a')), true, 'stop_hook_active leaves the turn for the real stop');

  r = await run('hook-stop.mjs', [], { env: childEnv(home, { RILL_API_BASE: api.url }), input: stopInput('missing') });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');

  writeTurn(home, 'b', { calls: [] });
  r = await run('hook-stop.mjs', [], { env: childEnv(home, { RILL_API_BASE: api.url }), input: stopInput('b') });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(existsSync(turnFile(home, 'b')), false, 'a turn without data calls is dropped');

  home = setup(t, { creds: null });
  writeTurn(home, 'c', { calls: [{ venue: 'hyperliquid', command: 'snapshot', symbol: 'BTC', at: 'x' }] });
  r = await run('hook-stop.mjs', [], { env: childEnv(home, { RILL_API_BASE: api.url }), input: stopInput('c') });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(existsSync(turnFile(home, 'c')), false);

  r = await run('hook-stop.mjs', [], { env: childEnv(home, { RILL_API_BASE: api.url }), input: 'not json' });
  assert.equal(r.code, 0);
  assert.equal(api.requests.length, 0, 'nothing was ever sent');
});

test('server error and timeout are silent, exit 0, and never double-send', async (t) => {
  let home = setup(t);
  const bad = await fakeServer(t, () => ({ status: 500, body: { error: 'boom' } }));
  writeTurn(home, 'e', { calls: [{ venue: 'hyperliquid', command: 'snapshot', symbol: 'BTC', at: 'x' }] });
  let r = await run('hook-stop.mjs', [], { env: childEnv(home, { RILL_API_BASE: bad.url }), input: stopInput('e') });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '');
  assert.equal(existsSync(turnFile(home, 'e')), false);

  home = setup(t);
  const slow = await fakeServer(t, () => ({ delayMs: 6000, body: {} }));
  writeTurn(home, 'f', { calls: [{ venue: 'hyperliquid', command: 'snapshot', symbol: 'BTC', at: 'x' }] });
  r = await run('hook-stop.mjs', [], { env: childEnv(home, { RILL_API_BASE: slow.url }), input: stopInput('f') });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
  assert.ok(r.ms < 4500, `3 s timeout, took ${r.ms} ms`);
  assert.equal(existsSync(turnFile(home, 'f')), false);
});
