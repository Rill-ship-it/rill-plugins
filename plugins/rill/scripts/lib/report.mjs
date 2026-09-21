// What the Stop hook sends to POST /v1/analyses (plugin-spec §5.2) and how it
// turns the reply into the one-line systemMessage.
import { dailyProgress } from './api.mjs';

export const MAX_TEXT_BYTES = 32 * 1024;

/** Which analysis command a raw data call implies. */
export const COMMAND_FROM_CALL = {
  snapshot: 'analysis',
  candles: 'analysis',
  markets: 'scan',
  mids: 'scan',
  predicted: 'funding',
  funding: 'funding',
  book: 'book',
  spot: 'spot',
};

// When a turn mixes calls and there is no record, the richest command wins.
const PRIORITY = ['analysis', 'funding', 'book', 'spot', 'scan'];

export function deriveTurnMeta(turn) {
  const calls = Array.isArray(turn?.calls) ? turn.calls : [];
  const rec = turn?.record && typeof turn.record === 'object' ? turn.record : null;

  const venue = rec?.venue || calls.find((c) => c?.venue)?.venue || 'hyperliquid';

  let command = rec?.command || null;
  if (!command) {
    const implied = calls.map((c) => COMMAND_FROM_CALL[c?.command]).filter(Boolean);
    command = PRIORITY.find((p) => implied.includes(p)) ?? null;
  }

  const symbols = new Set();
  for (const c of calls) if (typeof c?.symbol === 'string' && c.symbol) symbols.add(c.symbol.toUpperCase());
  for (const s of rec?.symbols ?? []) if (typeof s === 'string' && s) symbols.add(s.toUpperCase());

  return { venue, command, symbols: [...symbols] };
}

/** Truncate to at most `max` UTF-8 bytes without splitting a character. */
export function capBytes(str, max = MAX_TEXT_BYTES) {
  if (typeof str !== 'string') return null;
  const buf = Buffer.from(str, 'utf8');
  if (buf.length <= max) return str;
  let end = max;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--; // back up over continuation bytes to a character start
  return buf.subarray(0, end).toString('utf8');
}

export function buildAnalysisBody({ sessionId, turn, response, share = 'full', pluginVersion, client }) {
  const meta = deriveTurnMeta(turn);
  const body = {
    session_id: sessionId,
    prompt_id: turn.prompt_id ?? null,
    venue: meta.venue,
    command: meta.command,
    symbols: meta.symbols,
    calls: turn.calls ?? [],
    record: turn.record ?? null,
    plugin_version: pluginVersion,
    client,
    share,
  };
  if (share !== 'meta') {
    body.prompt = capBytes(turn.prompt);
    body.response = capBytes(response);
  }
  return body;
}

/**
 * "Rill · BTC analysis counted · Daily catch 7/20" — or null when nothing
 * should be shown (not_counted_command, unknown reason).
 */
export function catchMessage(res, body) {
  const find = res?.analysis?.find ?? {};
  let verb;
  if (find.reason === 'seen_before') verb = 'seen today';
  else if (find.reason === 'plugin_cap') verb = 'daily cap reached';
  else if (find.reason === 'ok' || find.counts === true) verb = 'counted';
  else return null;

  const p = dailyProgress(res?.user, res?.catch);
  const daily = p ? `${p.value}/${p.total}` : '?/?';
  const label = [...(body.symbols ?? []), body.command].filter(Boolean).join(' ');
  return `Rill · ${label} ${verb} · Daily catch ${daily}`;
}
