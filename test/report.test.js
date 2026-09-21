import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalysisBody, capBytes, catchMessage, deriveTurnMeta } from '../plugins/rill/scripts/lib/report.mjs';
import { SAMPLE_USER } from './helpers.mjs';

const call = (command, symbol = null) => ({ venue: 'hyperliquid', command, symbol, at: 'x' });

test('deriveTurnMeta: record wins; else calls map to commands by priority; symbols are a union', () => {
  assert.deepEqual(
    deriveTurnMeta({ calls: [call('snapshot', 'BTC'), call('book', 'eth')], record: { venue: 'hyperliquid', command: 'book', symbols: ['sol'] } }),
    { venue: 'hyperliquid', command: 'book', symbols: ['BTC', 'ETH', 'SOL'] },
  );
  const cases = [
    [['snapshot'], 'analysis'], [['candles'], 'analysis'], [['markets'], 'scan'], [['mids'], 'scan'],
    [['predicted'], 'funding'], [['funding'], 'funding'], [['book'], 'book'], [['spot'], 'spot'],
    [['markets', 'snapshot'], 'analysis'], [['predicted', 'book'], 'funding'], [['spot', 'markets'], 'spot'],
  ];
  for (const [cmds, expected] of cases) {
    assert.equal(deriveTurnMeta({ calls: cmds.map((c) => call(c)) }).command, expected, cmds.join('+'));
  }
  assert.deepEqual(deriveTurnMeta({ calls: [], record: null }), { venue: 'hyperliquid', command: null, symbols: [] });
  assert.deepEqual(deriveTurnMeta({ calls: [call('markets')] }).symbols, []);
});

test('capBytes cuts on a character boundary', () => {
  assert.equal(capBytes('abc', 10), 'abc');
  assert.equal(capBytes(null, 10), null);
  const s = capBytes('问'.repeat(100), 32);
  assert.ok(Buffer.byteLength(s) <= 32 && Buffer.byteLength(s) >= 30);
  assert.equal(s, '问'.repeat(s.length), 'no broken characters');
});

test('buildAnalysisBody: full vs meta', () => {
  const turn = { prompt_id: 'p', prompt: 'q', calls: [call('snapshot', 'BTC')], record: null };
  const full = buildAnalysisBody({ sessionId: 's', turn, response: 'r', share: 'full', pluginVersion: '0.1.0', client: { os: 'darwin', node: '26' } });
  assert.deepEqual(full, {
    session_id: 's', prompt_id: 'p', venue: 'hyperliquid', command: 'analysis', symbols: ['BTC'],
    calls: turn.calls, record: null, plugin_version: '0.1.0', client: { os: 'darwin', node: '26' }, share: 'full', prompt: 'q', response: 'r',
  });
  const meta = buildAnalysisBody({ sessionId: 's', turn, response: 'r', share: 'meta', pluginVersion: '0.1.0', client: {} });
  assert.equal('prompt' in meta, false);
  assert.equal('response' in meta, false);
  assert.equal(meta.share, 'meta');
});

test('catchMessage wording per find.reason', () => {
  const body = { symbols: ['BTC'], command: 'analysis' };
  const res = (find) => ({ analysis: { id: 'a', find }, user: SAMPLE_USER, catch: SAMPLE_USER.catches.daily });
  assert.equal(catchMessage(res({ counts: true, reason: 'ok' }), body), 'Rill · BTC analysis counted · Daily catch 7/20');
  assert.equal(catchMessage(res({ counts: false, reason: 'seen_before' }), body), 'Rill · BTC analysis seen today · Daily catch 7/20');
  assert.equal(catchMessage(res({ counts: false, reason: 'plugin_cap' }), body), 'Rill · BTC analysis daily cap reached · Daily catch 7/20');
  assert.equal(catchMessage(res({ counts: false, reason: 'not_counted_command' }), body), null);
  assert.equal(catchMessage(res({ counts: false, reason: 'something_new' }), body), null);
  assert.equal(catchMessage(res({ counts: true }), body), 'Rill · BTC analysis counted · Daily catch 7/20', 'counts:true without reason');
  assert.equal(catchMessage({ analysis: { find: { counts: true, reason: 'ok' } } }, { symbols: [], command: 'scan' }), 'Rill · scan counted · Daily catch ?/?');
  assert.equal(catchMessage({ analysis: { find: { reason: 'ok' } }, catch: { progress: { value: 3, total: 20 } } }, body), 'Rill · BTC analysis counted · Daily catch 3/20', 'catch fallback');
});
