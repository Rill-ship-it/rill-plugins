#!/usr/bin/env node
// Rill account CLI: login (device flow) · logout · status · open · record.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ApiError, apiFetch, clientInfo, dailyProgress, deviceLabel, pluginVersion, walletAddress } from './lib/api.mjs';
import { apiBase, appBase, clearCredentials, configPath, readConfig, readCredentials, writeCredentials } from './lib/config.mjs';
import { normalizeRecord, validateRecord } from './lib/record.mjs';
import { resolveSessionId, setRecord } from './lib/turn.mjs';

const USAGE = `usage: rill.mjs <command>

  login [--no-browser]                       sign in with your wallet (device flow, up to 10 min)
  login --start                              step 1: get the link + code, exit immediately
  login --wait --device-code <c> [--interval s] [--expires-in s]
                                             step 2: wait for approval, save credentials
  logout                                     revoke this token and forget it
  status [--brief]                           who is signed in, today's Daily catch
  open                                       open the Rill dashboard
  record --session <id>  < record.json       attach a rill.analysis/1 record to this turn`;

export const PRIVACY_NOTICE = `Privacy — what Rill collects from Claude Code
  • Only the turns that use Rill's data scripts: your question, the model's final answer,
    and which symbols were pulled — tied to your Rill account (wallet / Rill ID).
  • Used to improve the analysis framework, build the dataset (data → labs → proceeds to
    children's AI projects), and count your Daily catch.
  • Switch: ${configPath()}  { "share": "full" | "meta" }
    "meta" sends only symbols, command and the structured record — no question or answer
    text — and still counts. Default: "full".
  • Never collected: other conversations, file contents, working-directory paths,
    environment variables.
隐私说明 —— Rill 从 Claude Code 采集什么
  • 只采集用到 Rill 数据脚本的那一轮：你的提问原文、模型最终回答、拉取了哪些标的；绑定到你的 Rill 账号（钱包 / Rill ID）。
  • 用途：改进分析框架、构建数据集（数据 → 实验室 → 收益给儿童 AI 项目）、计算 Daily catch 进度。
  • 开关：${configPath()} 里 "share": "full" | "meta"；meta 只上报标的、命令和结构化记录，不含原文，仍计进度。默认 full。
  • 不采集：其他对话、文件内容、工作目录路径、环境变量。`;

const OPTIONS = {
  'no-browser': { type: 'boolean', default: false },
  start: { type: 'boolean', default: false },
  wait: { type: 'boolean', default: false },
  'device-code': { type: 'string' },
  interval: { type: 'string' },
  'expires-in': { type: 'string' },
  brief: { type: 'boolean', default: false },
  session: { type: 'string' },
  help: { type: 'boolean', short: 'h', default: false },
};

const out = (s = '') => process.stdout.write(s + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shortWallet = (w) => (typeof w === 'string' && w.length > 12 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w ?? '—');

export function openBrowser(url) {
  if (process.env.RILL_NO_BROWSER) return false;
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]]
      : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- login

async function deviceStart() {
  return apiFetch('/v1/device/start', {
    method: 'POST',
    body: { client: 'claude-code', version: pluginVersion(), label: deviceLabel() },
    timeoutMs: 10_000,
  });
}

function printStart(s, { noBrowser }) {
  const minutes = Math.round((Number(s.expires_in) || 600) / 60);
  out('Rill login');
  out(`  Open this link and approve "Claude Code (${deviceLabel()})":`);
  out(`    ${s.verify_url}`);
  out(`  Code: ${s.user_code}   (expires in ${minutes} min)`);
  const opened = noBrowser ? false : openBrowser(s.verify_url);
  out(opened ? '  Opening your browser… if nothing appears, paste the link above.' : '  Paste the link into a browser where your wallet is available.');
}

async function loginWait({ deviceCode, interval, expiresIn }) {
  const deadline = Date.now() + Math.min(Number(expiresIn) || 600, 600) * 1000;
  let waitS = Math.max(0.05, Number(interval) || 5);
  out('Waiting for approval…');
  while (Date.now() < deadline) {
    await sleep(waitS * 1000);
    let r;
    try {
      r = await apiFetch('/v1/device/poll', { method: 'POST', body: { device_code: deviceCode }, timeoutMs: 10_000 });
    } catch (err) {
      if (err.code === 'slow_down' || err.status === 429) { waitS += 5; continue; }
      if (err.code === 'timeout' || err.code === 'network') continue; // transient; keep polling
      throw err;
    }
    if (r?.status === 'pending') continue;
    if (r?.status === 'approved') return onApproved(r);
    if (r?.status === 'denied') { out('Login denied in the browser. Nothing was saved.'); return 1; }
    if (r?.status === 'expired') { out('The code expired. Run /rill:login again.'); return 1; }
    out(`Unexpected poll status "${r?.status}". Run /rill:login again.`); return 1;
  }
  out('Timed out after 10 minutes without approval. Run /rill:login again.');
  return 1;
}

function onApproved(r) {
  const user = r.user ?? {};
  const wallet = walletAddress(user);
  writeCredentials({
    token: r.token,
    uid: user.uid ?? null,
    user_id: user.id ?? null,
    wallet,
    api_base: apiBase(),
    client: clientInfo(),
    created_at: new Date().toISOString(),
  });
  const p = dailyProgress(user);
  const finds = user.today?.finds;
  out('');
  out('Signed in to Rill');
  out(`  Rill ID   ${user.uid ?? '—'}`);
  out(`  Wallet    ${wallet ?? '—'}`);
  out(`  Today     Daily catch ${p ? `${p.value}/${p.total}` : '?/?'}${Number.isFinite(finds) ? ` · finds ${finds}` : ''}`);
  out('');
  out(PRIVACY_NOTICE);
  return 0;
}

async function login(f) {
  if (f.wait) {
    if (!f['device-code']) throw new Error('login --wait needs --device-code');
    return loginWait({ deviceCode: f['device-code'], interval: f.interval, expiresIn: f['expires-in'] });
  }
  const s = await deviceStart();
  printStart(s, { noBrowser: f['no-browser'] });
  if (f.start) {
    out(`  Then run: rill.mjs login --wait --device-code ${s.device_code} --interval ${s.interval ?? 5} --expires-in ${s.expires_in ?? 600}`);
    return 0;
  }
  return loginWait({ deviceCode: s.device_code, interval: s.interval, expiresIn: s.expires_in });
}

// ---------------------------------------------------------------- logout / status / open

async function logout() {
  const creds = readCredentials();
  if (!creds) { out('Not signed in.'); return 0; }
  try {
    await apiFetch('/v1/auth/logout', { method: 'POST', body: {}, token: creds.token, timeoutMs: 3000 });
  } catch { /* the local copy goes regardless */ }
  clearCredentials();
  out(`Signed out of Rill${creds.uid ? ` (${creds.uid})` : ''}.`);
  return 0;
}

// Injected into the trade skill on every load, so it must return in < 2 s no
// matter what the network does: 1.5 s budget, then fall back to cached uid.
async function status(f) {
  const creds = readCredentials();
  if (!creds) {
    out(f.brief ? 'NOT_SIGNED_IN' : 'Not signed in. Run /rill:login to connect Claude Code to your Rill account.');
    return 0;
  }
  let me;
  try {
    me = await apiFetch('/v1/me', { token: creds.token, timeoutMs: 1500 });
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      out(f.brief ? 'NOT_SIGNED_IN' : `Saved token was rejected (${err.code}). Run /rill:login again.`);
      return 0;
    }
    out(f.brief ? `SIGNED_IN uid=${creds.uid ?? '?'} daily=?/?` : `Signed in as ${creds.uid ?? '?'} · wallet ${shortWallet(creds.wallet)} · progress unavailable (${err.message})`);
    return 0;
  }
  const user = me?.user ?? me ?? {};
  const uid = user.uid ?? creds.uid ?? '?';
  const p = dailyProgress(user);
  const daily = p ? `${p.value}/${p.total}` : '?/?';
  if (f.brief) { out(`SIGNED_IN uid=${uid} daily=${daily}`); return 0; }
  out('Rill');
  out(`  Rill ID   ${uid}`);
  out(`  Wallet    ${walletAddress(user) ?? creds.wallet ?? '—'}`);
  out(`  Today     Daily catch ${daily}${Number.isFinite(user.today?.finds) ? ` · finds ${user.today.finds}` : ''}${Number.isFinite(user.today?.analyses) ? ` · analyses ${user.today.analyses}` : ''}`);
  out(`  Share     ${readConfig().share}  (${configPath()})`);
  out(`  API       ${apiBase()}`);
  return 0;
}

function open() {
  const url = appBase();
  out(openBrowser(url) ? `Opening ${url}` : url);
  return 0;
}

// ---------------------------------------------------------------- record

function record(f) {
  let rec;
  try {
    rec = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    throw new Error('record: stdin is not valid JSON');
  }
  const problems = validateRecord(rec);
  if (problems.length) throw new Error(`record: invalid — ${problems.join('; ')}`);
  const sid = resolveSessionId(f.session);
  if (!sid) throw new Error('record: no session — pass --session <id>');
  const clean = normalizeRecord(rec);
  setRecord(sid, clean);
  out(`Record saved · ${clean.symbols.join(' ') || 'market'} ${clean.command} · ${clean.read.state} · ${clean.read.bias}`);
  return 0;
}

// ---------------------------------------------------------------- main

async function main(argv) {
  const { values: f, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  const command = positionals[0];
  if (f.help || !command) { out(USAGE); return f.help ? 0 : 2; }
  switch (command) {
    case 'login': return login(f);
    case 'logout': return logout();
    case 'status': return status(f);
    case 'open': return open();
    case 'record': return record(f);
    default: throw new Error(`unknown command "${command}" (try --help)`);
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    const detail = err instanceof ApiError ? `${err.message} [${err.code}]` : (err?.message ?? String(err));
    process.stderr.write(`rill: ${detail}\n`);
    process.exit(1);
  },
);
