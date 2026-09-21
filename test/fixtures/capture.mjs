#!/usr/bin/env node
// One-shot fixture capture. This is the only file in the repo that talks to the
// live Hyperliquid API; the test suite itself is offline and reads the JSON
// files this script writes. Re-run only when the wire format changes.
//
//   node test/fixtures/capture.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const INFO = 'https://api.hyperliquid.xyz/info';
const HOUR = 3_600_000;
const now = Date.now();

async function info(body) {
  const res = await fetch(INFO, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${body.type} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const targets = {
  'meta-and-asset-ctxs': { type: 'metaAndAssetCtxs' },
  'spot-meta-and-asset-ctxs': { type: 'spotMetaAndAssetCtxs' },
  'spot-meta': { type: 'spotMeta' },
  'all-mids': { type: 'allMids' },
  'funding-history-btc-7d': { type: 'fundingHistory', coin: 'BTC', startTime: now - 7 * 24 * HOUR },
  'predicted-fundings': { type: 'predictedFundings' },
  'l2book-btc': { type: 'l2Book', coin: 'BTC' },
  'candles-btc-1h': { type: 'candleSnapshot', req: { coin: 'BTC', interval: '1h', startTime: now - 48 * HOUR, endTime: now } },
  'candles-btc-4h': { type: 'candleSnapshot', req: { coin: 'BTC', interval: '4h', startTime: now - 60 * 4 * HOUR, endTime: now } },
  'candles-btc-1d': { type: 'candleSnapshot', req: { coin: 'BTC', interval: '1d', startTime: now - 30 * 24 * HOUR, endTime: now } },
};

await mkdir(here, { recursive: true });
const t0 = Date.now();
const results = await Promise.all(
  Object.entries(targets).map(async ([name, body]) => [name, await info(body)]),
);
for (const [name, data] of results) {
  const file = join(here, `${name}.json`);
  await writeFile(file, JSON.stringify(data));
  console.log(`${name}.json  ${JSON.stringify(data).length} bytes`);
}
await writeFile(join(here, 'captured-at.json'), JSON.stringify({ at: new Date(now).toISOString(), ms: Date.now() - t0 }));
console.log(`captured ${results.length} responses in ${Date.now() - t0} ms`);
