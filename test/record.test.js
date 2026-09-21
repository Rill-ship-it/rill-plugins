import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeRecord, validateRecord } from '../plugins/rill/scripts/lib/record.mjs';
import { childEnv, run, tmpHome } from './helpers.mjs';

const valid = () => ({
  schema: 'rill.analysis/1',
  venue: 'hyperliquid',
  symbols: ['btc'],
  command: 'analysis',
  question: { type: 'direction', horizon: 'days', language: 'zh' },
  read: { state: 'crowded-long', bias: 'neutral', confidence: 0.6, summary: '  Crowded long, wait for funding to reset.  ' },
  data: { as_of: '2026-09-21T06:00:00Z', price: 81708 },
  scenarios: [{ name: 'base', probability: 0.5 }],
  risk: null,
  pitfalls: ['01', '03'],
});

test('validateRecord: required keys and enums', () => {
  assert.deepEqual(validateRecord(valid()), []);
  assert.deepEqual(validateRecord(null), ['record must be a JSON object']);
  assert.deepEqual(validateRecord([]), ['record must be a JSON object']);

  const problems = validateRecord({ ...valid(), schema: 'x', venue: '', symbols: [], command: 'nope', read: { state: '', bias: 'up', summary: '' } });
  assert.ok(problems.some((p) => p.includes('schema')));
  assert.ok(problems.some((p) => p.includes('venue')));
  assert.ok(problems.some((p) => p.includes('symbols')));
  assert.ok(problems.some((p) => p.includes('command')));
  assert.ok(problems.some((p) => p.includes('read.state')));
  assert.ok(problems.some((p) => p.includes('read.bias')));
  assert.ok(problems.some((p) => p.includes('read.summary')));

  assert.deepEqual(validateRecord({ ...valid(), read: undefined }), ['read is required']);
  assert.deepEqual(validateRecord({ ...valid(), command: 'scan', symbols: [] }), [], 'scan may have no symbols');
  assert.equal(validateRecord({ ...valid(), symbols: ['BTC', 3] }).length, 1);
});

test('normalizeRecord uppercases symbols and clips the summary', () => {
  const r = normalizeRecord({ ...valid(), read: { ...valid().read, summary: 'x'.repeat(400) } });
  assert.deepEqual(r.symbols, ['BTC']);
  assert.equal(r.read.summary.length, 280);
  assert.equal(normalizeRecord(valid()).read.summary, 'Crowded long, wait for funding to reset.');
  assert.equal(r.question.language, 'zh', 'other fields untouched');
});

test('rill.mjs record: writes the record into the turn and prints one line', async (t) => {
  const home = tmpHome(t);
  mkdirSync(join(home, 'turns'), { recursive: true });
  writeFileSync(join(home, 'turns', 'sess-9.json'), JSON.stringify({ prompt_id: 'p', prompt: 'q', at: 'x', calls: [{ venue: 'hyperliquid', command: 'snapshot', symbol: 'BTC', at: 'x' }], record: null }));
  const r = await run('rill.mjs', ['record', '--session', 'sess-9'], { env: childEnv(home), input: valid() });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'Record saved · BTC analysis · crowded-long · neutral');
  assert.equal(r.stdout.trim().split('\n').length, 1);
  const turn = JSON.parse(readFileSync(join(home, 'turns', 'sess-9.json'), 'utf8'));
  assert.deepEqual(turn.record.symbols, ['BTC']);
  assert.equal(turn.record.read.state, 'crowded-long');
  assert.equal(turn.calls.length, 1, 'calls preserved');
  assert.equal(turn.prompt, 'q');
});

test('rill.mjs record: invalid record names the keys and exits 1', async (t) => {
  const home = tmpHome(t);
  const r = await run('rill.mjs', ['record', '--session', 'sess-9'], { env: childEnv(home), input: { ...valid(), read: { state: 'x', bias: 'sideways', summary: 's' } } });
  assert.equal(r.code, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /read\.bias/);
  assert.equal(r.stderr.trim().split('\n').length, 1);

  const r2 = await run('rill.mjs', ['record', '--session', 'sess-9'], { env: childEnv(home), input: '{not json' });
  assert.equal(r2.code, 1);
  assert.match(r2.stderr, /not valid JSON/);
});

test('rill.mjs record: session from CLAUDE_SESSION_ID when --session is absent; none → error', async (t) => {
  const home = tmpHome(t);
  const r = await run('rill.mjs', ['record'], { env: childEnv(home, { CLAUDE_SESSION_ID: 'env-sess' }), input: valid() });
  assert.equal(r.code, 0, r.stderr);
  const turn = JSON.parse(readFileSync(join(home, 'turns', 'env-sess.json'), 'utf8'));
  assert.equal(turn.record.command, 'analysis');
  assert.equal(turn.prompt, null, 'created on demand when the prompt hook never ran');

  const r2 = await run('rill.mjs', ['record'], { env: childEnv(tmpHome(t)), input: valid() });
  assert.equal(r2.code, 1);
  assert.match(r2.stderr, /no session/);
});
