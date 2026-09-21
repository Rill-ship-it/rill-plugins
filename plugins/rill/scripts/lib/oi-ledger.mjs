// Hyperliquid's info API exposes open interest only as a current value, but the
// OI × price quadrant needs its change. So every snapshot / markets call
// appends one sample per coin to a small JSONL ledger under ~/.rill/oi, and the
// next snapshot reads its 1 h / 24 h deltas from there. First run → null.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { rillHome } from './config.mjs';

const HOUR = 3_600_000;
const KEEP_MS = 8 * 24 * HOUR;
const PRUNE_AT_LINES = 3000;
const IGNORE_RECENT_MS = 10 * 60_000; // a re-run minutes later must not compare against itself

export const oiDir = () => process.env.RILL_OI_DIR || join(rillHome(), 'oi');
const fileFor = (coin) => join(oiDir(), `${String(coin).toUpperCase().replace(/[^A-Z0-9_-]/g, '_')}.jsonl`);

export function readSamples(coin) {
  let text;
  try {
    text = readFileSync(fileFor(coin), 'utf8');
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      const s = JSON.parse(line);
      if (Number.isFinite(s?.t) && Number.isFinite(s?.oi)) out.push(s);
    } catch { /* skip a torn line */ }
  }
  return out;
}

/** @param {Array<{coin:string, openInterest:number|null, markPx?:number|null}>} rows */
export function recordOi(rows, now = Date.now()) {
  mkdirSync(oiDir(), { recursive: true, mode: 0o700 });
  for (const r of rows ?? []) {
    if (!r?.coin || !Number.isFinite(r.openInterest)) continue;
    appendFileSync(fileFor(r.coin), JSON.stringify({ t: now, oi: r.openInterest, px: r.markPx ?? null }) + '\n');
    maybePrune(r.coin, now);
  }
}

function maybePrune(coin, now) {
  const samples = readSamples(coin);
  if (samples.length < PRUNE_AT_LINES) return;
  const kept = samples.filter((s) => now - s.t <= KEEP_MS);
  writeFileSync(fileFor(coin), kept.map((s) => JSON.stringify(s)).join('\n') + (kept.length ? '\n' : ''));
}

/** % change from the sample nearest `hoursAgo` (within ±tolerance) to `current`. */
export function changeVsSample(samples, current, now, hoursAgo, toleranceHours) {
  if (!Number.isFinite(current)) return null;
  const target = now - hoursAgo * HOUR;
  let best = null;
  for (const s of samples) {
    if (Math.abs(s.t - target) > toleranceHours * HOUR) continue;
    if (!best || Math.abs(s.t - target) < Math.abs(best.t - target)) best = s;
  }
  if (!best || best.oi === 0) return null;
  return ((current - best.oi) / best.oi) * 100;
}

export function oiDeltas(coin, currentOi, now = Date.now()) {
  const samples = readSamples(coin).filter((s) => now - s.t > IGNORE_RECENT_MS);
  return {
    change1hPct: changeVsSample(samples, currentOi, now, 1, 0.75),
    change24hPct: changeVsSample(samples, currentOi, now, 24, 8),
  };
}
