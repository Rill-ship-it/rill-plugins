// Hyperliquid public info API: fetch, normalizers, and the one-call snapshot.
// Read-only by construction — only POST /info is ever called, never /exchange.
//
// Conventions: prices/sizes are Numbers (the wire sends strings); funding is
// reported as a percent per interval and as an APR (rate ÷ intervalHours ×
// 24 × 365 × 100); null means "not available", never 0.

const DEFAULT_INFO_URL = 'https://api.hyperliquid.xyz/info';
export const infoUrl = () => process.env.RILL_HL_INFO_URL || DEFAULT_INFO_URL;

export const HOUR = 3_600_000;
export const INTERVAL_MS = {
  '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
  '1h': HOUR, '2h': 2 * HOUR, '4h': 4 * HOUR, '8h': 8 * HOUR, '12h': 12 * HOUR,
  '1d': 24 * HOUR, '3d': 72 * HOUR, '1w': 168 * HOUR, '1M': 720 * HOUR,
};
export const VENUE_KEYS = { HlPerp: 'hl', BinPerp: 'binance', BybitPerp: 'bybit' };

export class HlError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'HlError';
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** POST one info request. Retries exactly once on 429. */
export async function infoFetch(body, { fetchImpl = globalThis.fetch, timeoutMs = 10_000, url = infoUrl(), retryDelayMs = 1000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      throw new HlError(`hyperliquid ${body.type}: ${timedOut ? `timed out after ${timeoutMs} ms` : (err?.cause?.message || err?.message || 'network error')}`);
    }
    if (res.status === 429 && attempt === 0) {
      await sleep(retryDelayMs);
      continue;
    }
    if (!res.ok) throw new HlError(`hyperliquid ${body.type} ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
    return res.json();
  }
}

// ---------------------------------------------------------------- numbers

export function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function pctChange(now, prev) {
  const a = num(now);
  const b = num(prev);
  return a == null || b == null || b === 0 ? null : ((a - b) / b) * 100;
}

export function fundingToApr(rate, intervalHours = 1) {
  const r = num(rate);
  const h = num(intervalHours) || 1;
  return r == null ? null : (r / h) * 24 * 365 * 100;
}

export function isoTime(ms) {
  const n = num(ms);
  return n == null ? null : new Date(n).toISOString();
}

const pct = (v) => (num(v) == null ? null : num(v) * 100);

/** Sort a copy: numeric keys descending (nulls last), string keys ascending. */
export function sortRows(rows, key, { asc = false, byMagnitude = false } = {}) {
  const out = [...rows];
  const isString = out.some((r) => typeof r?.[key] === 'string');
  out.sort((a, b) => {
    if (isString) return String(a[key]).localeCompare(String(b[key]));
    const av = a[key] == null ? null : byMagnitude ? Math.abs(a[key]) : a[key];
    const bv = b[key] == null ? null : byMagnitude ? Math.abs(b[key]) : b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return asc ? av - bv : bv - av;
  });
  return out;
}

// ---------------------------------------------------------------- perps

/** metaAndAssetCtxs → [meta, ctxs]; universe[i] and ctxs[i] are parallel. */
export function normalizePerpMarkets(meta, ctxs) {
  return (meta?.universe ?? []).map((u, i) => {
    const c = ctxs?.[i] ?? {};
    const markPx = num(c.markPx);
    const oi = num(c.openInterest);
    return {
      coin: u.name,
      markPx,
      midPx: num(c.midPx),
      oraclePx: num(c.oraclePx),
      change24hPct: pctChange(c.markPx, c.prevDayPx),
      fundingHrPct: pct(c.funding),
      fundingAprPct: fundingToApr(c.funding, 1),
      openInterest: oi,
      oiNotional: oi != null && markPx != null ? oi * markPx : null,
      dayNtlVlm: num(c.dayNtlVlm),
      premiumPct: pct(c.premium),
      maxLeverage: u.maxLeverage ?? null,
      delisted: u.isDelisted === true,
    };
  });
}

export const PERP_SORT_KEYS = ['dayNtlVlm', 'change24hPct', 'fundingAprPct', 'fundingHrPct', 'openInterest', 'oiNotional', 'premiumPct', 'markPx', 'coin'];

const boardRow = ({ coin, markPx, change24hPct, fundingAprPct, oiNotional, dayNtlVlm, premiumPct }) =>
  ({ coin, markPx, change24hPct, fundingAprPct, oiNotional, dayNtlVlm, premiumPct });

/** The six boards the `scan` command reads, from one markets fetch. */
export function marketBoards(rows, limit = 10) {
  const top = (key, opts) => sortRows(rows, key, opts).slice(0, limit).map(boardRow);
  return {
    topVolume: top('dayNtlVlm'),
    topGainers: top('change24hPct'),
    topLosers: top('change24hPct', { asc: true }),
    fundingHigh: top('fundingAprPct'),
    fundingLow: top('fundingAprPct', { asc: true }),
    topOi: top('oiNotional'),
  };
}

// ---------------------------------------------------------------- spot

/**
 * spotMetaAndAssetCtxs → [spotMeta, ctxs]. Unlike perps, ctxs is NOT parallel to
 * universe (868 vs 329 rows on 2026-09-21), so rows are joined on ctx.coin ===
 * universe.name. Non-canonical pairs are named "@<index>"; the display pair is
 * rebuilt from tokens (e.g. "@107" → "HYPE/USDC").
 */
export function normalizeSpotMarkets(spotMeta, ctxs) {
  const tokens = new Map((spotMeta?.tokens ?? []).map((t) => [t.index, t]));
  const tokenName = (idx) => tokens.get(idx)?.name ?? `#${idx}`;
  const byCoin = new Map((ctxs ?? []).map((c) => [c.coin, c]));
  return (spotMeta?.universe ?? []).map((u) => {
    const c = byCoin.get(u.name) ?? {};
    const [baseIdx, quoteIdx] = Array.isArray(u.tokens) ? u.tokens : [];
    const base = baseIdx == null ? null : tokenName(baseIdx);
    const quote = quoteIdx == null ? null : tokenName(quoteIdx);
    const markPx = num(c.markPx);
    const supply = num(c.circulatingSupply);
    return {
      pair: base && quote ? `${base}/${quote}` : u.name,
      key: u.name,
      base,
      quote,
      markPx,
      midPx: num(c.midPx),
      change24hPct: pctChange(c.markPx, c.prevDayPx),
      dayNtlVlm: num(c.dayNtlVlm),
      circulatingSupply: supply,
      marketCap: markPx != null && supply != null ? markPx * supply : null,
      canonical: u.isCanonical === true,
    };
  });
}

export const SPOT_SORT_KEYS = ['dayNtlVlm', 'change24hPct', 'marketCap', 'markPx', 'pair'];

/** The spot pair that backs a perp coin: base = COIN or UCOIN (HL unit tokens), USDC quote preferred, most volume wins. */
export function spotForCoin(spotRows, coin) {
  const c = String(coin).toUpperCase();
  const cands = spotRows.filter((r) => r.base && r.markPx != null && [c, `U${c}`].includes(r.base.toUpperCase()));
  if (!cands.length) return null;
  const usdc = cands.filter((r) => r.quote === 'USDC');
  const best = sortRows(usdc.length ? usdc : cands, 'dayNtlVlm')[0];
  return { pair: best.pair, markPx: best.markPx, dayNtlVlm: best.dayNtlVlm };
}

/** "HYPE/USDC" → "@107" (the key l2Book / candleSnapshot expect); canonical names and perp coins pass through. */
export function resolveMarketKey(spotMeta, name) {
  if (!String(name).includes('/')) return name;
  const rows = normalizeSpotMarkets(spotMeta, []);
  const hit = rows.find((r) => r.pair.toUpperCase() === String(name).toUpperCase());
  return hit ? (hit.canonical ? hit.pair : hit.key) : name;
}

// ---------------------------------------------------------------- mids

/** allMids keys: perp coin / canonical pair (pass through), "@<index>" (spot, resolved), "#<n>" (builder perp dex, as-is). */
export function resolveMids(allMids, spotMeta, coinFilter) {
  const nameByKey = new Map(normalizeSpotMarkets(spotMeta, []).map((r) => [r.key, r.pair]));
  const filter = coinFilter ? String(coinFilter).toUpperCase() : null;
  const rows = [];
  for (const [key, px] of Object.entries(allMids ?? {})) {
    const coin = nameByKey.get(key) ?? key;
    if (filter && !coin.toUpperCase().includes(filter)) continue;
    rows.push({ coin, mid: num(px) });
  }
  return sortRows(rows, 'coin');
}

// ---------------------------------------------------------------- book

/** l2Book → { coin, time, levels: [bids[], asks[]] }, each level { px, sz, n }. */
export function normalizeBook(payload, depth = 10) {
  const [bids = [], asks = []] = payload?.levels ?? [];
  const d = Math.min(Math.max(1, Number(depth) || 10), 20);
  const mk = (side) => (l, i) => ({ side, level: i + 1, px: num(l.px), sz: num(l.sz), orders: l.n ?? null });
  return [...bids.slice(0, d).map(mk('bid')), ...asks.slice(0, d).map(mk('ask'))];
}

/** USD resting inside a price band, walking from the top of book. */
export function depthUsdWithin(levels, limitPx, side) {
  let usd = 0;
  for (const l of levels ?? []) {
    const px = num(l.px);
    const sz = num(l.sz);
    if (px == null || sz == null) continue;
    if (side === 'bid' ? px < limitPx : px > limitPx) break;
    usd += px * sz;
  }
  return usd;
}

const sideReaches = (levels, limitPx, side) => {
  const px = num(levels?.[levels.length - 1]?.px);
  return px != null && (side === 'bid' ? px <= limitPx : px >= limitPx);
};

/**
 * Spread and ±1% depth. l2Book returns at most 20 levels, which on a major
 * covers a few bps, so an `aggregated` book (nSigFigs 3) is used for the depth
 * whenever the full-precision one does not reach the 1% boundary.
 */
export function bookSummary(payload, aggregated = null) {
  const [bids = [], asks = []] = payload?.levels ?? [];
  const bestBid = num(bids[0]?.px);
  const bestAsk = num(asks[0]?.px);
  if (bestBid == null || bestAsk == null) {
    return { bestBid, bestAsk, mid: null, spreadBps: null, depth1pctBidUsd: null, depth1pctAskUsd: null, depthCoverage: { bid: false, ask: false } };
  }
  const mid = (bestBid + bestAsk) / 2;
  const [aggBids = [], aggAsks = []] = aggregated?.levels ?? [];
  const depth = (full, agg, limit, side) => {
    if (sideReaches(full, limit, side)) return [depthUsdWithin(full, limit, side), true];
    if (sideReaches(agg, limit, side)) return [depthUsdWithin(agg, limit, side), true];
    return [Math.max(depthUsdWithin(full, limit, side), depthUsdWithin(agg, limit, side)), false];
  };
  const [bidUsd, bidCovered] = depth(bids, aggBids, mid * 0.99, 'bid');
  const [askUsd, askCovered] = depth(asks, aggAsks, mid * 1.01, 'ask');
  return {
    bestBid,
    bestAsk,
    mid,
    spreadBps: ((bestAsk - bestBid) / mid) * 10_000,
    depth1pctBidUsd: bidUsd,
    depth1pctAskUsd: askUsd,
    depthCoverage: { bid: bidCovered, ask: askCovered },
  };
}

// ---------------------------------------------------------------- candles

/** candleSnapshot rows: { t, T, s, i, o, h, l, c, v, n } → OHLCV with ISO open time, ascending. */
export function normalizeCandles(rows) {
  return (rows ?? [])
    .map((c) => ({ time: isoTime(c.t), open: num(c.o), high: num(c.h), low: num(c.l), close: num(c.c), volume: num(c.v), trades: c.n ?? null }))
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

/** Average true range over the last `period` candles (simple mean of true ranges). */
export function atr(rows, period = 14) {
  const trs = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const prevClose = rows[i - 1].close;
    if (r.high == null || r.low == null || prevClose == null) continue;
    trs.push(Math.max(r.high - r.low, Math.abs(r.high - prevClose), Math.abs(r.low - prevClose)));
  }
  if (!trs.length) return null;
  const tail = trs.slice(-period);
  return tail.reduce((a, b) => a + b, 0) / tail.length;
}

export function candleSummary(rows) {
  if (!rows?.length) return { n: 0, changePct: null, high: null, low: null, atr14: null };
  const highs = rows.map((r) => r.high).filter((v) => v != null);
  const lows = rows.map((r) => r.low).filter((v) => v != null);
  return {
    n: rows.length,
    changePct: pctChange(rows[rows.length - 1].close, rows[0].open),
    high: highs.length ? Math.max(...highs) : null,
    low: lows.length ? Math.min(...lows) : null,
    atr14: atr(rows, 14),
  };
}

// ---------------------------------------------------------------- funding

/** fundingHistory rows: { coin, fundingRate, premium, time } → hourly prints, ascending. */
export function normalizeFundingHistory(rows) {
  return (rows ?? [])
    .map((r) => ({
      coin: r.coin,
      fundingRatePct: pct(r.fundingRate),
      fundingAprPct: fundingToApr(r.fundingRate, 1),
      premiumPct: pct(r.premium),
      time: isoTime(r.time),
    }))
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

/** Persistence stats; signStreakHours is signed (−6 = six consecutive negative hours ending now). */
export function fundingHistorySummary(rows) {
  const aprs = (rows ?? []).map((r) => r.fundingAprPct).filter((v) => v != null);
  if (!aprs.length) return { meanAprPct: null, minAprPct: null, maxAprPct: null, hoursPositive: 0, hoursNegative: 0, signStreakHours: 0 };
  const lastSign = Math.sign(aprs[aprs.length - 1]);
  let streak = 0;
  if (lastSign !== 0) for (let i = aprs.length - 1; i >= 0 && Math.sign(aprs[i]) === lastSign; i--) streak++;
  return {
    meanAprPct: aprs.reduce((a, b) => a + b, 0) / aprs.length,
    minAprPct: Math.min(...aprs),
    maxAprPct: Math.max(...aprs),
    hoursPositive: aprs.filter((v) => v > 0).length,
    hoursNegative: aprs.filter((v) => v < 0).length,
    signStreakHours: lastSign * streak,
  };
}

/**
 * predictedFundings: [[coin, [[venue, { fundingRate, fundingIntervalHours, nextFundingTime }], …]], …]
 * Each venue is annualized with its own interval (HL 1 h; Binance / Bybit 8 h as of 2026-09).
 */
export function normalizePredictedFundings(data, coinFilter) {
  const filter = coinFilter ? String(coinFilter).toUpperCase() : null;
  const rows = [];
  for (const entry of data ?? []) {
    const coin = entry?.[0];
    if (filter && String(coin).toUpperCase() !== filter) continue;
    const apr = {};
    const hours = {};
    let nextHl = null;
    for (const [venue, v] of entry?.[1] ?? []) {
      const key = VENUE_KEYS[venue];
      if (!key || !v) continue;
      apr[key] = fundingToApr(v.fundingRate, v.fundingIntervalHours);
      hours[key] = num(v.fundingIntervalHours);
      if (key === 'hl') nextHl = v.nextFundingTime;
    }
    const hl = apr.hl ?? null;
    rows.push({
      coin,
      hlAprPct: hl,
      binanceAprPct: apr.binance ?? null,
      bybitAprPct: apr.bybit ?? null,
      hlVsBinancePct: hl != null && apr.binance != null ? hl - apr.binance : null,
      hlVsBybitPct: hl != null && apr.bybit != null ? hl - apr.bybit : null,
      nextHlFunding: isoTime(nextHl),
      intervalHours: { hl: hours.hl ?? null, binance: hours.binance ?? null, bybit: hours.bybit ?? null },
    });
  }
  return rows;
}

export const PREDICTED_SORT_KEYS = ['hlVsBinancePct', 'hlVsBybitPct', 'hlAprPct', 'binanceAprPct', 'bybitAprPct', 'coin'];

// ---------------------------------------------------------------- snapshot

/**
 * Everything `analysis` needs for one coin, from parallel info calls:
 * metaAndAssetCtxs, fundingHistory (7 d), predictedFundings, l2Book (×2: full
 * precision + nSigFigs 3 for ±1 % depth), candleSnapshot (1h×48, 4h×60, 1d×30),
 * spotMetaAndAssetCtxs. Shape per plugin-spec §6.3 plus market.oiChange*.
 */
export async function snapshot(coin, { fetchImpl = globalThis.fetch, now = Date.now(), oiDeltas = null } = {}) {
  const c = String(coin ?? '').trim().toUpperCase();
  if (!c) throw new HlError('coin is required');
  const req = (body) => infoFetch(body, { fetchImpl });
  const candles = (interval, n) => req({ type: 'candleSnapshot', req: { coin: c, interval, startTime: now - n * INTERVAL_MS[interval], endTime: now } });

  // Settle everything so an unknown coin reports "no perp market" instead of
  // whichever per-coin call happened to fail first.
  const settled = await Promise.allSettled([
    req({ type: 'metaAndAssetCtxs' }),
    req({ type: 'fundingHistory', coin: c, startTime: now - 7 * 24 * HOUR }),
    req({ type: 'predictedFundings' }),
    req({ type: 'l2Book', coin: c }),
    req({ type: 'l2Book', coin: c, nSigFigs: 3 }),
    candles('1h', 48),
    candles('4h', 60),
    candles('1d', 30),
    req({ type: 'spotMetaAndAssetCtxs' }),
  ]);
  if (settled[0].status === 'rejected') throw settled[0].reason;
  const perp = settled[0].value;
  const m = normalizePerpMarkets(perp?.[0], perp?.[1]).find((r) => String(r.coin).toUpperCase() === c);
  if (!m) throw new HlError(`No perp market for "${coin}" — run \`hl.mjs markets\` to list symbols`);
  const failed = settled.find((s) => s.status === 'rejected');
  if (failed) throw failed.reason;
  const [, hist, predicted, book, bookAgg, c1h, c4h, c1d, spot] = settled.map((s) => s.value);

  const pred = normalizePredictedFundings(predicted, c)[0] ?? null;
  const bs = bookSummary(book, bookAgg);
  const summarize = (rows, n) => candleSummary(normalizeCandles(rows).slice(-n));
  const deltas = oiDeltas ? oiDeltas(c, m.openInterest, now) : { change1hPct: null, change24hPct: null };

  return {
    as_of: new Date(now).toISOString(),
    venue: 'hyperliquid',
    coin: c,
    market: {
      markPx: m.markPx,
      oraclePx: m.oraclePx,
      midPx: m.midPx,
      change24hPct: m.change24hPct,
      premiumPct: m.premiumPct,
      openInterest: m.openInterest,
      oiNotional: m.oiNotional,
      oiChange1hPct: deltas.change1hPct,
      oiChange24hPct: deltas.change24hPct,
      dayNtlVlm: m.dayNtlVlm,
      maxLeverage: m.maxLeverage,
    },
    funding: {
      hrPct: m.fundingHrPct,
      aprPct: m.fundingAprPct,
      hist7d: fundingHistorySummary(normalizeFundingHistory(hist)),
      predicted: {
        hlAprPct: pred?.hlAprPct ?? null,
        binanceAprPct: pred?.binanceAprPct ?? null,
        bybitAprPct: pred?.bybitAprPct ?? null,
        nextHlFunding: pred?.nextHlFunding ?? null,
      },
    },
    book: {
      bestBid: bs.bestBid,
      bestAsk: bs.bestAsk,
      spreadBps: bs.spreadBps,
      depth1pctBidUsd: bs.depth1pctBidUsd,
      depth1pctAskUsd: bs.depth1pctAskUsd,
    },
    candles: { '1h': summarize(c1h, 48), '4h': summarize(c4h, 60), '1d': summarize(c1d, 30) },
    spot: spotForCoin(normalizeSpotMarkets(spot?.[0], spot?.[1]), c),
  };
}

/** Strip float noise (10.950000000000001 → 10.95) without losing tiny prices. */
export function tidy(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Number(value.toPrecision(10)) : null;
  if (Array.isArray(value)) return value.map(tidy);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, tidy(v)]));
  return value;
}
