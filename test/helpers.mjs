// Shared test plumbing: isolated ~/.rill, child-process runner, a tiny HTTP
// server, and a responder that serves the captured Hyperliquid fixtures.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SCRIPTS = join(ROOT, 'plugins', 'rill', 'scripts');
export const FIXTURES = join(ROOT, 'test', 'fixtures');

export const fixture = (name) => JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8'));

export function tmpHome(t) {
  const dir = mkdtempSync(join(tmpdir(), 'rill-test-'));
  t?.after?.(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const ISOLATED = ['RILL_API_BASE', 'RILL_APP_BASE', 'RILL_TURNS_DIR', 'RILL_OI_DIR', 'RILL_HL_INFO_URL', 'CLAUDE_SESSION_ID'];

/** Child env: isolated home, no browser, none of the developer's own RILL_* overrides. */
export function childEnv(home, extra = {}) {
  const env = { ...process.env, RILL_HOME: home, RILL_NO_BROWSER: '1', ...extra };
  for (const k of ISOLATED) if (!(k in extra)) delete env[k];
  return env;
}

export function run(script, args = [], { env = childEnv(tmpHome()), input, timeoutMs = 30_000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [join(SCRIPTS, script), ...args], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${script} ${args.join(' ')} timed out`)); }, timeoutMs);
    child.on('error', reject);
    child.on('close', (code) => { clearTimeout(timer); resolvePromise({ code, stdout, stderr, ms: Date.now() - started }); });
    child.stdin.end(input == null ? '' : typeof input === 'string' ? input : JSON.stringify(input));
  });
}

/**
 * handler(req, requests) → { status?, body?, delayMs?, hang? }
 * req = { method, path, headers, json }
 */
export async function fakeServer(t, handler) {
  const requests = [];
  const sockets = new Set();
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let json = null;
    try { json = raw ? JSON.parse(raw) : null; } catch { /* not JSON */ }
    const r = { method: req.method, path: req.url, headers: req.headers, json };
    requests.push(r);
    const out = (await handler(r, requests)) ?? {};
    if (out.hang) return;
    if (out.delayMs) await new Promise((ok) => setTimeout(ok, out.delayMs));
    res.writeHead(out.status ?? 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out.body ?? {}));
  });
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${server.address().port}`;
  const close = () => new Promise((ok) => { for (const s of sockets) s.destroy(); server.close(() => ok()); });
  t?.after?.(close);
  return { url, requests, close };
}

/** A synthetic nSigFigs-3 style book: 20 levels per side, 0.15 % apart, so it spans ±3 %. */
export function aggregatedBook(book) {
  const mid = (Number(book.levels[0][0].px) + Number(book.levels[1][0].px)) / 2;
  const side = (sign) => Array.from({ length: 20 }, (_, i) => ({ px: (mid * (1 + sign * 0.0015 * (i + 1))).toFixed(1), sz: '10', n: 5 }));
  return { coin: book.coin, time: book.time, levels: [side(-1), side(1)] };
}

/** Maps an info body to a fixture; `{ __status }` simulates an HTTP error (HL answers 500 for unknown coins). */
export function hlFixtureResponder(body) {
  const known = (coin) => String(coin).toUpperCase() === 'BTC' || String(coin).startsWith('@') || String(coin).includes('/');
  switch (body?.type) {
    case 'metaAndAssetCtxs': return fixture('meta-and-asset-ctxs');
    case 'spotMetaAndAssetCtxs': return fixture('spot-meta-and-asset-ctxs');
    case 'spotMeta': return fixture('spot-meta');
    case 'allMids': return fixture('all-mids');
    case 'predictedFundings': return fixture('predicted-fundings');
    case 'fundingHistory': return known(body.coin) ? fixture('funding-history-btc-7d') : { __status: 500, body: null };
    case 'l2Book': return known(body.coin) ? (body.nSigFigs ? aggregatedBook(fixture('l2book-btc')) : fixture('l2book-btc')) : { __status: 500, body: null };
    case 'candleSnapshot': return known(body.req?.coin) ? fixture(`candles-btc-${body.req.interval}`) : [];
    default: return { __status: 422, body: null };
  }
}

/** In-process fetch stub for the normalizer/snapshot tests. */
export function stubFetch(responder = hlFixtureResponder) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const data = responder(body, calls);
    if (data && data.__status) return new Response(JSON.stringify(data.body ?? null), { status: data.__status });
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetchImpl, calls };
}

/** HTTP version of the responder for CLI tests; `rateLimitOnce` makes the first request of that type answer 429. */
export function hlServerHandler({ rateLimitOnce = null } = {}) {
  const limited = new Set();
  return (req) => {
    const body = req.json;
    if (rateLimitOnce && body?.type === rateLimitOnce && !limited.has(body.type)) {
      limited.add(body.type);
      return { status: 429, body: { error: 'rate limited' } };
    }
    const data = hlFixtureResponder(body);
    if (data && data.__status) return { status: data.__status, body: data.body };
    return { body: data };
  };
}

export const SAMPLE_USER = {
  id: '0xabc0000000000000000000000000000000000def',
  uid: 'u_7k3m9qx2',
  wallet: { address: '0xabc0000000000000000000000000000000000def' },
  today: { finds: 7, analyses: 1 },
  catches: { daily: { progress: { value: 7, total: 20 } } },
};
