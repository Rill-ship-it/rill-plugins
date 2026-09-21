import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { childEnv, fakeServer, hlServerHandler, run, tmpHome } from './helpers.mjs';

async function hlEnv(t, opts) {
  const home = tmpHome(t);
  const api = await fakeServer(t, hlServerHandler(opts));
  return { home, api, env: childEnv(home, { RILL_HL_INFO_URL: `${api.url}/info` }) };
}
const out = (r) => JSON.parse(r.stdout);
const turn = (home, sid) => JSON.parse(readFileSync(join(home, 'turns', `${sid}.json`), 'utf8'));

test('markets --coin BTC: JSON envelope, normalized row, call logged to the turn file', async (t) => {
  const { home, env } = await hlEnv(t);
  const r = await run('hl.mjs', ['markets', '--coin', 'btc', '--session', 'sess-a'], { env });
  assert.equal(r.code, 0, r.stderr);
  const j = out(r);
  assert.equal(j.venue, 'hyperliquid');
  assert.equal(j.command, 'markets');
  assert.equal(j.count, 178, 'live perps (delisted hidden)');
  assert.equal(j.rows.length, 1);
  assert.equal(j.rows[0].coin, 'BTC');
  assert.equal(j.rows[0].maxLeverage, 40);
  assert.equal(j.rows[0].fundingAprPct, 10.95);
  assert.equal('delisted' in j.rows[0], false);
  const tf = turn(home, 'sess-a');
  assert.equal(tf.prompt, null);
  assert.deepEqual(tf.calls.map((c) => [c.venue, c.command, c.symbol]), [['hyperliquid', 'markets', 'BTC']]);
  assert.equal(tf.calls[0].at, j.as_of);
  assert.ok(readdirSync(join(home, 'oi')).length >= 234, 'markets feeds the OI ledger');
});

test('markets --boards, --sort/--asc/--limit, --include-delisted', async (t) => {
  const { env } = await hlEnv(t);
  let j = out(await run('hl.mjs', ['markets', '--boards', '--limit', '3'], { env }));
  assert.deepEqual(Object.keys(j.boards), ['topVolume', 'topGainers', 'topLosers', 'fundingHigh', 'fundingLow', 'topOi']);
  assert.equal(j.boards.topVolume.length, 3);

  j = out(await run('hl.mjs', ['markets', '--sort', 'fundingAprPct', '--asc', '--limit', '2'], { env }));
  assert.ok(j.rows[0].fundingAprPct <= j.rows[1].fundingAprPct);

  j = out(await run('hl.mjs', ['markets', '--include-delisted', '--limit', '1'], { env }));
  assert.equal(j.count, 234);

  const bad = await run('hl.mjs', ['markets', '--sort', 'nope'], { env });
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /--sort must be one of/);
});

test('snapshot: full object, positional coin, session from CLAUDE_SESSION_ID', async (t) => {
  const { home, env } = await hlEnv(t);
  const r = await run('hl.mjs', ['snapshot', 'btc'], { env: { ...env, CLAUDE_SESSION_ID: 'sess-env' } });
  assert.equal(r.code, 0, r.stderr);
  const j = out(r);
  assert.equal(j.coin, 'BTC');
  assert.deepEqual(Object.keys(j), ['as_of', 'venue', 'coin', 'market', 'funding', 'book', 'candles', 'spot']);
  assert.equal(j.market.oiChange24hPct, null, 'no ledger history on a fresh machine');
  assert.equal(j.spot.pair, 'UBTC/USDC');
  assert.deepEqual(turn(home, 'sess-env').calls.map((c) => c.command + ':' + c.symbol), ['snapshot:BTC']);
  assert.ok(existsSync(join(home, 'oi', 'BTC.jsonl')));
});

test('one retry on 429', async (t) => {
  const { api, env } = await hlEnv(t, { rateLimitOnce: 'metaAndAssetCtxs' });
  const r = await run('hl.mjs', ['markets', '--coin', 'BTC'], { env });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(api.requests.filter((q) => q.json?.type === 'metaAndAssetCtxs').length, 2);
});

test('errors: unknown coin → exit 1 one line; missing --coin / unknown command → exit 2', async (t) => {
  const { home, env } = await hlEnv(t);
  let r = await run('hl.mjs', ['snapshot', '--coin', 'NOPE_X', '--session', 'sess-err'], { env });
  assert.equal(r.code, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^hl: No perp market for "NOPE_X"/);
  assert.equal(r.stderr.trim().split('\n').length, 1);
  assert.equal(existsSync(join(home, 'turns', 'sess-err.json')), false, 'failed calls are not logged');

  r = await run('hl.mjs', ['book'], { env });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /needs --coin/);

  r = await run('hl.mjs', ['frobnicate'], { env });
  assert.equal(r.code, 2);

  r = await run('hl.mjs', [], { env });
  assert.equal(r.code, 2);
  assert.match(r.stdout, /usage: hl\.mjs/);

  r = await run('hl.mjs', ['--help'], { env });
  assert.equal(r.code, 0);
});

test('spot, mids, predicted, funding, candles, book', async (t) => {
  const { api, home, env } = await hlEnv(t);
  const sid = ['--session', 'sess-all'];

  let j = out(await run('hl.mjs', ['spot', '--pair', 'hype', '--limit', '1', ...sid], { env }));
  assert.equal(j.rows[0].pair, 'HYPE/USDC');
  assert.equal(j.rows[0].key, '@107');
  assert.equal(j.count, 329);

  j = out(await run('hl.mjs', ['mids', '--coin', 'purr', ...sid], { env }));
  assert.ok(j.rows.some((r) => r.coin === 'PURR/USDC'));

  j = out(await run('hl.mjs', ['predicted', '--coin', 'BTC', ...sid], { env }));
  assert.deepEqual(j.rows[0].intervalHours, { hl: 1, binance: 8, bybit: 8 });
  assert.equal(j.rows[0].hlAprPct, 10.95);

  j = out(await run('hl.mjs', ['predicted', '--limit', '5', ...sid], { env }));
  assert.equal(j.rows.length, 5);
  const gaps = j.rows.map((r) => Math.abs(r.hlVsBinancePct ?? -Infinity));
  assert.ok(gaps[0] >= gaps[4], 'default sort by absolute HL-vs-Binance gap');

  j = out(await run('hl.mjs', ['funding', '--coin', 'BTC', '--hours', '168', '--limit', '3', ...sid], { env }));
  assert.equal(j.rows.length, 3);
  assert.ok(j.rows[0].time > j.rows[2].time, 'newest first');
  assert.equal(j.summary.hoursPositive + j.summary.hoursNegative <= 168, true);
  assert.equal(j.hours, 168);

  j = out(await run('hl.mjs', ['candles', '--coin', 'BTC', '--interval', '4h', '--limit', '10', ...sid], { env }));
  assert.equal(j.rows.length, 10);
  assert.equal(j.summary.n, 10);
  assert.ok(j.summary.atr14 > 0);

  j = out(await run('hl.mjs', ['book', '--coin', 'HYPE/USDC', '--depth', '2', ...sid], { env }));
  assert.equal(j.coin, 'HYPE/USDC');
  assert.equal(j.levels.length, 4);
  assert.equal(j.summary.depthCoverage.bid, true, 'aggregated book covers 1%');
  const l2 = api.requests.filter((q) => q.json?.type === 'l2Book').map((q) => q.json.coin);
  assert.ok(l2.every((c) => c === '@107'), `display pair resolved to the API key, got ${l2}`);

  const bad = await run('hl.mjs', ['candles', '--coin', 'BTC', '--interval', '7h'], { env });
  assert.equal(bad.code, 2);

  assert.deepEqual(
    turn(home, 'sess-all').calls.map((c) => `${c.command}:${c.symbol}`),
    ['spot:HYPE', 'mids:PURR', 'predicted:BTC', 'predicted:null', 'funding:BTC', 'candles:BTC', 'book:HYPE/USDC'],
  );
});

test('no session anywhere → data still returned, nothing logged', async (t) => {
  const { home, env } = await hlEnv(t);
  const r = await run('hl.mjs', ['mids', '--coin', 'BTC'], { env });
  assert.equal(r.code, 0);
  assert.ok(out(r).rows.length > 0);
  assert.equal(existsSync(join(home, 'turns')), false);
});
