import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpHome } from './helpers.mjs';

const home = tmpHome();
process.env.RILL_HOME = home;
delete process.env.RILL_OI_DIR;
const ledger = await import('../plugins/rill/scripts/lib/oi-ledger.mjs');

const HOUR = 3_600_000;
const near = (a, b, tol = 1e-9) => assert.ok(a != null && Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('recordOi appends one JSONL line per coin; unknown OI skipped', () => {
  const now = 1_800_000_000_000;
  ledger.recordOi([{ coin: 'BTC', openInterest: 100, markPx: 80000 }, { coin: 'x/y', openInterest: null }], now);
  const lines = readFileSync(join(home, 'oi', 'BTC.jsonl'), 'utf8').trim().split('\n');
  assert.deepEqual(JSON.parse(lines[0]), { t: now, oi: 100, px: 80000 });
  assert.deepEqual(ledger.readSamples('btc'), [{ t: now, oi: 100, px: 80000 }]);
  assert.deepEqual(ledger.readSamples('x/y'), []);
});

test('oiDeltas picks the nearest sample inside each window and ignores the last 10 minutes', () => {
  const now = 1_800_000_000_000;
  ledger.recordOi([{ coin: 'ETH', openInterest: 1000 }], now - 26 * HOUR);
  ledger.recordOi([{ coin: 'ETH', openInterest: 1100 }], now - 23 * HOUR);
  ledger.recordOi([{ coin: 'ETH', openInterest: 1200 }], now - 70 * 60_000);
  ledger.recordOi([{ coin: 'ETH', openInterest: 1250 }], now - 5 * 60_000);
  const d = ledger.oiDeltas('ETH', 1300, now);
  near(d.change24hPct, ((1300 - 1100) / 1100) * 100, 1e-9); // 23 h beats 26 h
  near(d.change1hPct, ((1300 - 1200) / 1200) * 100, 1e-9); // 70 min inside [15 min, 105 min]; 5 min ignored
  assert.deepEqual(ledger.oiDeltas('NONE', 5, now), { change1hPct: null, change24hPct: null });
  assert.deepEqual(ledger.oiDeltas('ETH', null, now), { change1hPct: null, change24hPct: null });
});

test('changeVsSample returns null outside the tolerance window', () => {
  const now = 1_800_000_000_000;
  const samples = [{ t: now - 40 * HOUR, oi: 50 }];
  assert.equal(ledger.changeVsSample(samples, 60, now, 24, 8), null);
  near(ledger.changeVsSample([{ t: now - 24 * HOUR, oi: 50 }], 60, now, 24, 8), 20);
});
