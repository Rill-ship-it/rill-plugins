import test from 'node:test';
import assert from 'node:assert/strict';
import * as hl from '../plugins/rill/scripts/lib/hyperliquid.mjs';
import { aggregatedBook, fixture, stubFetch } from './helpers.mjs';

const near = (a, b, tol = 1e-6) => assert.ok(a != null && Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('fundingToApr annualizes per interval (HL 1 h, CEX 8 h)', () => {
  near(hl.fundingToApr('0.0000125', 1), 10.95);
  near(hl.fundingToApr('0.0000969', 8), 10.6106, 1e-4);
  near(hl.fundingToApr('0.00007879', 8), 8.6275, 1e-4);
  assert.equal(hl.fundingToApr(null), null);
  assert.equal(hl.fundingToApr('x'), null);
});

test('perp markets: 234 rows, 56 delisted, BTC normalization', () => {
  const [meta, ctxs] = fixture('meta-and-asset-ctxs');
  const rows = hl.normalizePerpMarkets(meta, ctxs);
  assert.equal(rows.length, 234);
  assert.equal(rows.filter((r) => r.delisted).length, 56);
  const btc = rows.find((r) => r.coin === 'BTC');
  assert.equal(btc.maxLeverage, 40);
  assert.equal(btc.markPx, 81563);
  assert.equal(btc.oraclePx, 81531);
  near(btc.fundingHrPct, 0.00125);
  near(btc.fundingAprPct, 10.95);
  near(btc.oiNotional, 43303.8759599999 * 81563, 1e-3);
  near(btc.change24hPct, ((81563 - 80500) / 80500) * 100);
  near(btc.premiumPct, 0.03924887);
  assert.equal(btc.delisted, false);
});

test('marketBoards ranks six boards from one row set', () => {
  const [meta, ctxs] = fixture('meta-and-asset-ctxs');
  const rows = hl.normalizePerpMarkets(meta, ctxs).filter((r) => !r.delisted);
  const boards = hl.marketBoards(rows, 5);
  assert.deepEqual(Object.keys(boards), ['topVolume', 'topGainers', 'topLosers', 'fundingHigh', 'fundingLow', 'topOi']);
  assert.equal(boards.topVolume.length, 5);
  assert.ok(boards.topVolume[0].dayNtlVlm >= boards.topVolume[4].dayNtlVlm);
  assert.ok(boards.fundingHigh[0].fundingAprPct >= boards.fundingHigh[4].fundingAprPct);
  assert.ok(boards.fundingLow[0].fundingAprPct <= boards.fundingLow[4].fundingAprPct);
  assert.ok(boards.topLosers[0].change24hPct <= boards.topGainers[0].change24hPct);
  assert.deepEqual(Object.keys(boards.topOi[0]), ['coin', 'markPx', 'change24hPct', 'fundingAprPct', 'oiNotional', 'dayNtlVlm', 'premiumPct']);
});

test('spot markets join ctxs by coin name (ctxs is not parallel to universe)', () => {
  const [meta, ctxs] = fixture('spot-meta-and-asset-ctxs');
  assert.notEqual(meta.universe.length, ctxs.length, 'fixture must exhibit the mismatch');
  const rows = hl.normalizeSpotMarkets(meta, ctxs);
  assert.equal(rows.length, 329);
  assert.equal(rows.filter((r) => r.markPx == null).length, 0, 'every pair found its ctx');
  const hype = rows.find((r) => r.pair === 'HYPE/USDC');
  assert.equal(hype.key, '@107');
  assert.equal(hype.base, 'HYPE');
  assert.equal(hype.quote, 'USDC');
  assert.equal(hype.markPx, 93.89);
  assert.equal(hype.canonical, false);
  near(hype.marketCap, 93.89 * 298800506.9058614969, 1);
  const purr = rows.find((r) => r.pair === 'PURR/USDC');
  assert.equal(purr.canonical, true);
  assert.equal(purr.key, 'PURR/USDC');
});

test('spotForCoin resolves unit tokens and prefers USDC quote', () => {
  const [meta, ctxs] = fixture('spot-meta-and-asset-ctxs');
  const rows = hl.normalizeSpotMarkets(meta, ctxs);
  assert.equal(hl.spotForCoin(rows, 'BTC').pair, 'UBTC/USDC');
  assert.equal(hl.spotForCoin(rows, 'hype').pair, 'HYPE/USDC');
  assert.equal(hl.spotForCoin(rows, 'NOPE_X'), null);
});

test('resolveMarketKey maps display pairs to API keys', () => {
  const meta = fixture('spot-meta');
  assert.equal(hl.resolveMarketKey(meta, 'HYPE/USDC'), '@107');
  assert.equal(hl.resolveMarketKey(meta, 'PURR/USDC'), 'PURR/USDC');
  assert.equal(hl.resolveMarketKey(meta, 'BTC'), 'BTC');
});

test('resolveMids resolves @index keys known to spotMeta and filters by substring', () => {
  const spotMeta = fixture('spot-meta');
  const rows = hl.resolveMids(fixture('all-mids'), spotMeta);
  assert.equal(rows.length, 1102);
  // allMids carries 465 "@" keys but spotMeta.universe lists only 329 pairs; the
  // 137 without an entry must pass through untouched, every listed one must resolve.
  const known = new Set(spotMeta.universe.map((u) => u.name));
  const leftover = rows.filter((r) => r.coin.startsWith('@')).map((r) => r.coin);
  assert.equal(leftover.length, 137);
  assert.ok(leftover.every((k) => !known.has(k)), 'no resolvable key left unresolved');
  assert.equal(rows.find((r) => r.coin === 'BTC').mid, 81563.5);
  assert.ok(rows.some((r) => r.coin === 'HYPE/USDC'));
  const purr = hl.resolveMids(fixture('all-mids'), fixture('spot-meta'), 'purr');
  assert.ok(purr.length >= 2 && purr.every((r) => r.coin.toUpperCase().includes('PURR')));
});

test('book: levels, spread, and ±1% depth fall back to the aggregated book', () => {
  const book = fixture('l2book-btc');
  const levels = hl.normalizeBook(book, 3);
  assert.equal(levels.length, 6);
  assert.deepEqual(levels[0], { side: 'bid', level: 1, px: 81563, sz: 1.31725, orders: 15 });
  assert.equal(levels[3].side, 'ask');

  const full = hl.bookSummary(book);
  assert.equal(full.bestBid, 81563);
  assert.equal(full.bestAsk, 81564);
  near(full.spreadBps, (1 / 81563.5) * 10_000, 1e-9);
  assert.equal(full.depthCoverage.bid, false, '20 raw levels on BTC do not reach 1%');

  const agg = aggregatedBook(book);
  const withAgg = hl.bookSummary(book, agg);
  assert.equal(withAgg.depthCoverage.bid, true);
  assert.equal(withAgg.depthCoverage.ask, true);
  // 0.15% spacing → six levels inside 1% (0.15 … 0.90), 10 each
  const mid = withAgg.mid;
  const expectBid = agg.levels[0].slice(0, 6).reduce((s, l) => s + Number(l.px) * 10, 0);
  near(withAgg.depth1pctBidUsd, expectBid, 1e-6);
  assert.ok(withAgg.depth1pctAskUsd > mid * 10 * 5);
});

test('candles: normalized ascending, summary over the window', () => {
  const rows = hl.normalizeCandles(fixture('candles-btc-1h')).slice(-48);
  assert.equal(rows.length, 48);
  assert.ok(rows[0].time < rows[47].time);
  const s = hl.candleSummary(rows);
  assert.equal(s.n, 48);
  near(s.changePct, ((rows[47].close - rows[0].open) / rows[0].open) * 100, 1e-9);
  assert.equal(s.high, Math.max(...rows.map((r) => r.high)));
  assert.equal(s.low, Math.min(...rows.map((r) => r.low)));
  assert.ok(s.atr14 > 0 && s.atr14 < s.high - s.low);
  assert.deepEqual(hl.candleSummary([]), { n: 0, changePct: null, high: null, low: null, atr14: null });
});

test('funding history: sorted, summary matches an independent count', () => {
  const raw = fixture('funding-history-btc-7d');
  const rows = hl.normalizeFundingHistory(raw);
  assert.equal(rows.length, raw.length);
  assert.ok(rows[0].time < rows[rows.length - 1].time);
  const s = hl.fundingHistorySummary(rows);
  const positive = raw.filter((r) => Number(r.fundingRate) > 0).length;
  const negative = raw.filter((r) => Number(r.fundingRate) < 0).length;
  assert.equal(s.hoursPositive, positive);
  assert.equal(s.hoursNegative, negative);
  const sorted = [...raw].sort((a, b) => a.time - b.time);
  let streak = 0;
  const lastSign = Math.sign(Number(sorted[sorted.length - 1].fundingRate));
  for (let i = sorted.length - 1; i >= 0 && Math.sign(Number(sorted[i].fundingRate)) === lastSign; i--) streak++;
  assert.equal(s.signStreakHours, lastSign * streak);
  assert.ok(s.minAprPct <= s.meanAprPct && s.meanAprPct <= s.maxAprPct);
});

test('predicted fundings: per-venue intervals and spreads', () => {
  const rows = hl.normalizePredictedFundings(fixture('predicted-fundings'), 'btc');
  assert.equal(rows.length, 1);
  const btc = rows[0];
  assert.deepEqual(btc.intervalHours, { hl: 1, binance: 8, bybit: 8 });
  near(btc.hlAprPct, 10.95);
  near(btc.binanceAprPct, 10.6106, 1e-4);
  near(btc.hlVsBinancePct, 10.95 - 10.6106, 1e-4);
  assert.equal(btc.nextHlFunding, new Date(1789966800000).toISOString());
  assert.equal(hl.normalizePredictedFundings(fixture('predicted-fundings')).length, 234);
});

test('sortRows: numeric desc with nulls last, asc flag, magnitude, string asc', () => {
  const rows = [{ k: 1, n: 'b' }, { k: null, n: 'a' }, { k: -5, n: 'c' }, { k: 3, n: 'd' }];
  assert.deepEqual(hl.sortRows(rows, 'k').map((r) => r.k), [3, 1, -5, null]);
  assert.deepEqual(hl.sortRows(rows, 'k', { asc: true }).map((r) => r.k), [-5, 1, 3, null]);
  assert.deepEqual(hl.sortRows(rows, 'k', { byMagnitude: true }).map((r) => r.k), [-5, 3, 1, null]);
  assert.deepEqual(hl.sortRows(rows, 'n').map((r) => r.n), ['a', 'b', 'c', 'd']);
});

test('snapshot assembles the §6.3 shape from nine parallel calls', async () => {
  const { fetchImpl, calls } = stubFetch();
  const snap = await hl.snapshot('btc', { fetchImpl, oiDeltas: () => ({ change1hPct: 1.5, change24hPct: -2 }) });
  assert.equal(calls.length, 9);
  assert.deepEqual(Object.keys(snap), ['as_of', 'venue', 'coin', 'market', 'funding', 'book', 'candles', 'spot']);
  assert.equal(snap.coin, 'BTC');
  assert.deepEqual(Object.keys(snap.market), ['markPx', 'oraclePx', 'midPx', 'change24hPct', 'premiumPct', 'openInterest', 'oiNotional', 'oiChange1hPct', 'oiChange24hPct', 'dayNtlVlm', 'maxLeverage']);
  assert.equal(snap.market.oiChange1hPct, 1.5);
  assert.deepEqual(Object.keys(snap.funding), ['hrPct', 'aprPct', 'hist7d', 'predicted']);
  assert.deepEqual(Object.keys(snap.funding.hist7d), ['meanAprPct', 'minAprPct', 'maxAprPct', 'hoursPositive', 'hoursNegative', 'signStreakHours']);
  assert.deepEqual(Object.keys(snap.funding.predicted), ['hlAprPct', 'binanceAprPct', 'bybitAprPct', 'nextHlFunding']);
  assert.deepEqual(Object.keys(snap.book), ['bestBid', 'bestAsk', 'spreadBps', 'depth1pctBidUsd', 'depth1pctAskUsd']);
  assert.deepEqual(Object.keys(snap.candles), ['1h', '4h', '1d']);
  assert.equal(snap.candles['1h'].n, 48);
  assert.equal(snap.candles['4h'].n, 60);
  assert.equal(snap.candles['1d'].n, 30);
  assert.deepEqual(snap.spot, { pair: 'UBTC/USDC', markPx: snap.spot.markPx, dayNtlVlm: snap.spot.dayNtlVlm });
  near(snap.funding.aprPct, 10.95);
  assert.ok(snap.book.depth1pctBidUsd > 0);
});

test('snapshot: unknown coin reports "no perp market", not a sub-call failure', async () => {
  const { fetchImpl } = stubFetch();
  await assert.rejects(hl.snapshot('NOPE_X', { fetchImpl }), (err) => err instanceof hl.HlError && /No perp market/.test(err.message));
});

test('infoFetch retries once on 429, then surfaces the error', async () => {
  let n = 0;
  const fetchImpl = async () => (++n === 1 ? new Response('slow', { status: 429 }) : new Response('[]', { status: 200 }));
  assert.deepEqual(await hl.infoFetch({ type: 'x' }, { fetchImpl, retryDelayMs: 1 }), []);
  assert.equal(n, 2);
  n = 0;
  const always429 = async () => new Response('slow', { status: 429 });
  await assert.rejects(hl.infoFetch({ type: 'x' }, { fetchImpl: always429, retryDelayMs: 1 }), (err) => err.status === 429);
});

test('tidy strips float noise but keeps tiny prices', () => {
  assert.deepEqual(hl.tidy({ a: 10.950000000000001, b: [0.00007681], c: 'x', d: null }), { a: 10.95, b: [0.00007681], c: 'x', d: null });
});
