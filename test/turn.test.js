import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { SCRIPTS, tmpHome } from './helpers.mjs';

const home = tmpHome();
process.env.RILL_HOME = home;
delete process.env.RILL_TURNS_DIR;
delete process.env.CLAUDE_SESSION_ID;

const turn = await import('../plugins/rill/scripts/lib/turn.mjs');

test('sanitizeSessionId accepts ids and rejects path tricks', () => {
  assert.equal(turn.sanitizeSessionId('abc-123_X'), 'abc-123_X');
  assert.equal(turn.sanitizeSessionId('../etc'), null);
  assert.equal(turn.sanitizeSessionId('a/b'), null);
  assert.equal(turn.sanitizeSessionId(''), null);
  assert.equal(turn.sanitizeSessionId(42), null);
  assert.throws(() => turn.turnPath('../x'), /invalid session id/);
});

test('write / read / append / record / delete round-trip', () => {
  const sid = 's1';
  turn.writeTurn(sid, turn.newTurn({ prompt_id: 'p1', prompt: 'BTC 怎么样' }));
  assert.equal(turn.turnPath(sid), join(home, 'turns', 's1.json'));
  let t = turn.readTurn(sid);
  assert.deepEqual({ ...t, at: null }, { prompt_id: 'p1', prompt: 'BTC 怎么样', at: null, calls: [], record: null });

  turn.appendCall(sid, { venue: 'hyperliquid', command: 'snapshot', symbol: 'BTC', at: '2026-09-21T00:00:00Z' });
  turn.appendCall(sid, { venue: 'hyperliquid', command: 'markets', symbol: null });
  t = turn.readTurn(sid);
  assert.equal(t.calls.length, 2);
  assert.deepEqual(t.calls[0], { venue: 'hyperliquid', command: 'snapshot', symbol: 'BTC', at: '2026-09-21T00:00:00Z' });
  assert.equal(t.calls[1].symbol, null);
  assert.match(t.calls[1].at, /^\d{4}-/);

  turn.setRecord(sid, { schema: 'rill.analysis/1', command: 'analysis' });
  assert.equal(turn.readTurn(sid).record.command, 'analysis');
  assert.equal(turn.readTurn(sid).prompt, 'BTC 怎么样', 'record keeps the prompt');

  assert.equal(turn.deleteTurn(sid), true);
  assert.equal(turn.readTurn(sid), null);
  assert.equal(turn.deleteTurn(sid), false);
});

test('appendCall creates the turn when the prompt hook never ran', () => {
  turn.appendCall('orphan', { venue: 'hyperliquid', command: 'book', symbol: 'ETH' });
  const t = turn.readTurn('orphan');
  assert.equal(t.prompt, null);
  assert.equal(t.calls.length, 1);
  turn.deleteTurn('orphan');
});

test('latestSessionId / resolveSessionId precedence', () => {
  turn.writeTurn('old', turn.newTurn());
  turn.writeTurn('new', turn.newTurn());
  const past = new Date(Date.now() - 60_000);
  utimesSync(turn.turnPath('old'), past, past);
  assert.equal(turn.latestSessionId(), 'new');
  assert.equal(turn.resolveSessionId('explicit'), 'explicit');
  process.env.CLAUDE_SESSION_ID = 'from-env';
  assert.equal(turn.resolveSessionId(undefined), 'from-env');
  assert.equal(turn.resolveSessionId('../bad'), 'from-env', 'invalid explicit id falls through');
  delete process.env.CLAUDE_SESSION_ID;
  assert.equal(turn.resolveSessionId(undefined), 'new');
  turn.deleteTurn('old');
  turn.deleteTurn('new');
  assert.equal(turn.resolveSessionId(undefined), null);
});

test('concurrent appends from separate processes lose nothing (mkdir lock)', async () => {
  const sid = 'race';
  turn.writeTurn(sid, turn.newTurn({ prompt: 'x' }));
  const script = `import { appendCall } from ${JSON.stringify(join(SCRIPTS, 'lib', 'turn.mjs'))}; appendCall(${JSON.stringify(sid)}, { venue: 'hyperliquid', command: 'markets', symbol: process.argv[1] });`;
  const N = 12;
  await Promise.all(Array.from({ length: N }, (_, i) =>
    promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, `S${i}`], { env: { ...process.env, RILL_HOME: home } })));
  const t = turn.readTurn(sid);
  assert.equal(t.calls.length, N);
  assert.equal(new Set(t.calls.map((c) => c.symbol)).size, N);
  assert.equal(existsSync(`${turn.turnPath(sid)}.lock`), false, 'lock released');
  turn.deleteTurn(sid);
});
