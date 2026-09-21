#!/usr/bin/env node
// Rill's Hyperliquid reader. Output is JSON only — the model does the
// formatting. Every successful run appends a call to the session's turn file,
// which is what lets the Stop hook count the analysis.
import { parseArgs } from 'node:util';
import * as hl from './lib/hyperliquid.mjs';
import { oiDeltas, recordOi } from './lib/oi-ledger.mjs';
import { appendCall, resolveSessionId } from './lib/turn.mjs';

const USAGE = `usage: hl.mjs <command> [flags] [--session <id>]

  markets    [--coin C] [--sort F] [--asc] [--limit N] [--include-delisted] [--boards]
  spot       [--pair P] [--sort F] [--asc] [--limit N] [--canonical-only]
  mids       [--coin SUBSTR]
  book       --coin C|PAIR [--depth N] [--n-sig-figs N]
  candles    --coin C|PAIR [--interval 1h] [--limit N]
  funding    --coin C [--hours 24] [--limit N]
  predicted  [--coin C] [--sort F] [--asc] [--limit N]
  snapshot   --coin C

Sort keys — markets: ${hl.PERP_SORT_KEYS.join(' ')}
             spot: ${hl.SPOT_SORT_KEYS.join(' ')}
             predicted: ${hl.PREDICTED_SORT_KEYS.join(' ')}
Intervals: ${Object.keys(hl.INTERVAL_MS).join(' ')}
A bare positional argument is taken as --coin / --pair. JSON only; read-only.`;

const OPTIONS = {
  coin: { type: 'string' },
  pair: { type: 'string' },
  sort: { type: 'string' },
  limit: { type: 'string' },
  depth: { type: 'string' },
  'n-sig-figs': { type: 'string' },
  interval: { type: 'string' },
  hours: { type: 'string' },
  session: { type: 'string' },
  asc: { type: 'boolean', default: false },
  boards: { type: 'boolean', default: false },
  'include-delisted': { type: 'boolean', default: false },
  'canonical-only': { type: 'boolean', default: false },
  json: { type: 'boolean', default: false }, // accepted for symmetry; JSON is the only output
  help: { type: 'boolean', short: 'h', default: false },
};

class UsageError extends Error {}

const intFlag = (v, fallback, { min = 1, max = Infinity } = {}) => {
  if (v == null) return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) throw new UsageError(`expected a number, got "${v}"`);
  return Math.min(Math.max(n, min), max);
};

const requireSort = (key, allowed) => {
  if (key != null && !allowed.includes(key)) throw new UsageError(`--sort must be one of ${allowed.join(' ')}`);
  return key;
};

const limitRows = (rows, limit) => (limit ? rows.slice(0, limit) : rows);
const envelope = (command, extra) => ({ as_of: new Date().toISOString(), venue: 'hyperliquid', command, ...extra });

// Each command returns { payload, symbol }; symbol is what gets logged to the turn file.
const commands = {
  async markets(f) {
    const [meta, ctxs] = await hl.infoFetch({ type: 'metaAndAssetCtxs' });
    let rows = hl.normalizePerpMarkets(meta, ctxs);
    recordOi(rows);
    if (!f['include-delisted']) rows = rows.filter((r) => !r.delisted);
    const total = rows.length;
    const limit = intFlag(f.limit, f.boards ? 10 : 0, { min: 0 });

    if (f.boards) return { payload: envelope('markets', { count: total, boards: hl.marketBoards(rows, limit || 10) }), symbol: null };

    if (f.coin) {
      const c = f.coin.trim().toUpperCase();
      rows = rows.filter((r) => r.coin.toUpperCase() === c);
      if (!rows.length) throw new hl.HlError(`No perp market for coin "${f.coin}" — run \`hl.mjs markets\` to list symbols`);
    }
    rows = limitRows(hl.sortRows(rows, requireSort(f.sort, hl.PERP_SORT_KEYS) ?? 'dayNtlVlm', { asc: f.asc }), limit);
    return {
      payload: envelope('markets', { count: total, rows: rows.map(({ delisted, ...r }) => r) }),
      symbol: f.coin ? f.coin.trim().toUpperCase() : null,
    };
  },

  async spot(f) {
    const [meta, ctxs] = await hl.infoFetch({ type: 'spotMetaAndAssetCtxs' });
    let rows = hl.normalizeSpotMarkets(meta, ctxs);
    const total = rows.length;
    if (f['canonical-only']) rows = rows.filter((r) => r.canonical);
    let symbol = null;
    if (f.pair) {
      const q = f.pair.trim().toUpperCase();
      rows = rows.filter((r) => r.pair.toUpperCase().includes(q) || (r.base ?? '').toUpperCase() === q);
      if (!rows.length) throw new hl.HlError(`No spot pair matching "${f.pair}"`);
      symbol = q;
    }
    rows = limitRows(hl.sortRows(rows, requireSort(f.sort, hl.SPOT_SORT_KEYS) ?? 'dayNtlVlm', { asc: f.asc }), intFlag(f.limit, 0, { min: 0 }));
    return { payload: envelope('spot', { count: total, rows }), symbol };
  },

  async mids(f) {
    const [allMids, spotMeta] = await Promise.all([hl.infoFetch({ type: 'allMids' }), hl.infoFetch({ type: 'spotMeta' })]);
    const rows = hl.resolveMids(allMids, spotMeta, f.coin);
    if (f.coin && !rows.length) throw new hl.HlError(`No market matching "${f.coin}"`);
    return { payload: envelope('mids', { count: rows.length, rows }), symbol: f.coin ? f.coin.trim().toUpperCase() : null };
  },

  async book(f) {
    const coin = await marketKey(f.coin);
    const body = { type: 'l2Book', coin };
    const nSig = f['n-sig-figs'] == null ? null : intFlag(f['n-sig-figs'], null, { min: 2, max: 5 });
    if (nSig != null) body.nSigFigs = nSig;
    const [book, agg] = await Promise.all([hl.infoFetch(body), nSig == null ? hl.infoFetch({ type: 'l2Book', coin, nSigFigs: 3 }) : null]);
    const levels = hl.normalizeBook(book, intFlag(f.depth, 10, { min: 1, max: 20 }));
    if (!levels.length) throw new hl.HlError(`No order book for "${f.coin}" — check the symbol`);
    return {
      payload: envelope('book', { coin: f.coin.trim().toUpperCase(), summary: hl.bookSummary(book, agg), levels }),
      symbol: f.coin.trim().toUpperCase(),
    };
  },

  async candles(f) {
    const coin = await marketKey(f.coin);
    const interval = f.interval ?? '1h';
    const step = hl.INTERVAL_MS[interval];
    if (!step) throw new UsageError(`--interval must be one of ${Object.keys(hl.INTERVAL_MS).join(' ')}`);
    const limit = intFlag(f.limit, 100, { min: 1, max: 5000 });
    const now = Date.now();
    const raw = await hl.infoFetch({ type: 'candleSnapshot', req: { coin, interval, startTime: now - step * limit, endTime: now } });
    const rows = hl.normalizeCandles(raw).slice(-limit);
    if (!rows.length) throw new hl.HlError(`No candles for "${f.coin}" @ ${interval} — check the symbol`);
    return {
      payload: envelope('candles', { coin: f.coin.trim().toUpperCase(), interval, summary: hl.candleSummary(rows), rows }),
      symbol: f.coin.trim().toUpperCase(),
    };
  },

  async funding(f) {
    const coin = f.coin.trim().toUpperCase();
    const hours = intFlag(f.hours, 24, { min: 1, max: 24 * 30 });
    const raw = await hl.infoFetch({ type: 'fundingHistory', coin, startTime: Date.now() - hours * hl.HOUR });
    const rows = hl.normalizeFundingHistory(raw);
    if (!rows.length) throw new hl.HlError(`No funding history for "${f.coin}" — check the symbol`);
    const limit = intFlag(f.limit, 0, { min: 0 });
    return {
      payload: envelope('funding', { coin, hours, summary: hl.fundingHistorySummary(rows), rows: limitRows([...rows].reverse(), limit) }),
      symbol: coin,
    };
  },

  async predicted(f) {
    const data = await hl.infoFetch({ type: 'predictedFundings' });
    let rows = hl.normalizePredictedFundings(data, f.coin);
    if (f.coin && !rows.length) throw new hl.HlError(`No predicted funding for coin "${f.coin}"`);
    const sortKey = requireSort(f.sort, hl.PREDICTED_SORT_KEYS) ?? 'hlVsBinancePct';
    rows = limitRows(hl.sortRows(rows, sortKey, { asc: f.asc, byMagnitude: sortKey.startsWith('hlVs') }), intFlag(f.limit, 0, { min: 0 }));
    return { payload: envelope('predicted', { count: rows.length, rows }), symbol: f.coin ? f.coin.trim().toUpperCase() : null };
  },

  async snapshot(f) {
    const snap = await hl.snapshot(f.coin, { oiDeltas });
    recordOi([{ coin: snap.coin, openInterest: snap.market.openInterest, markPx: snap.market.markPx }]);
    return { payload: snap, symbol: snap.coin };
  },
};

const NEEDS_COIN = new Set(['book', 'candles', 'funding', 'snapshot']);

// "HYPE/USDC" → "@107" for the endpoints that want the raw spot key.
async function marketKey(name) {
  if (!name.includes('/')) return name.trim().toUpperCase();
  return hl.resolveMarketKey(await hl.infoFetch({ type: 'spotMeta' }), name.trim());
}

async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (err) {
    throw new UsageError(err.message);
  }
  const { values: f, positionals } = parsed;
  const [command, positional] = positionals;
  if (f.help || !command) {
    process.stdout.write(USAGE + '\n');
    return f.help ? 0 : 2;
  }
  const run = commands[command];
  if (!run) throw new UsageError(`unknown command "${command}"`);
  if (positional && !f.coin && !f.pair) {
    if (command === 'spot') f.pair = positional;
    else f.coin = positional;
  }
  if (NEEDS_COIN.has(command) && !f.coin?.trim()) throw new UsageError(`${command} needs --coin`);

  const { payload, symbol } = await run(f);
  process.stdout.write(JSON.stringify(hl.tidy(payload)) + '\n');

  const session = resolveSessionId(f.session);
  if (session) {
    try {
      appendCall(session, { venue: 'hyperliquid', command, symbol, at: payload.as_of });
    } catch { /* logging must never break the data path */ }
  }
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    const usage = err instanceof UsageError;
    process.stderr.write(`hl: ${err?.message ?? err}${usage ? ' (try --help)' : ''}\n`);
    process.exit(usage ? 2 : 1);
  },
);
