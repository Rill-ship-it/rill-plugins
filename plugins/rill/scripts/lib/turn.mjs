// The per-session "turn file": what the user asked this turn, which data
// calls the model made, and the structured record it wrote. Created by the
// UserPromptSubmit hook, appended to by hl.mjs / rill.mjs record, consumed and
// deleted by the Stop hook.
//
// Shape: { prompt_id, prompt, at, calls: [{ venue, command, symbol, at }], record }
import { mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { turnsDir } from './config.mjs';

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function sanitizeSessionId(id) {
  return typeof id === 'string' && SAFE_ID.test(id) ? id : null;
}

export function turnPath(sessionId) {
  const id = sanitizeSessionId(sessionId);
  if (!id) throw new Error(`invalid session id: ${String(sessionId).slice(0, 40)}`);
  return join(turnsDir(), `${id}.json`);
}

export function newTurn({ prompt_id = null, prompt = null, at = new Date().toISOString() } = {}) {
  return { prompt_id, prompt, at, calls: [], record: null };
}

export function readTurn(sessionId) {
  try {
    const t = JSON.parse(readFileSync(turnPath(sessionId), 'utf8'));
    if (!t || typeof t !== 'object') return null;
    if (!Array.isArray(t.calls)) t.calls = [];
    if (t.record === undefined) t.record = null;
    return t;
  } catch {
    return null;
  }
}

// Write via rename so a concurrent reader never sees a half-written file.
export function writeTurn(sessionId, turn) {
  const path = turnPath(sessionId);
  mkdirSync(turnsDir(), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(turn) + '\n', { mode: 0o600 });
  renameSync(tmp, path);
  return path;
}

export function deleteTurn(sessionId) {
  try {
    unlinkSync(turnPath(sessionId));
    return true;
  } catch {
    return false;
  }
}

// The model may run several hl.mjs calls in parallel; a mkdir lock keeps the
// read-modify-write of `calls` from losing entries. mkdir is atomic everywhere.
function withLock(sessionId, fn) {
  const lock = `${turnPath(sessionId)}.lock`;
  mkdirSync(turnsDir(), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 2000;
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (Date.now() > deadline || isStale(lock)) {
        try { rmdirSync(lock); } catch { /* another holder cleaned it */ }
        continue;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15); // sleep 15 ms
    }
  }
  try {
    return fn();
  } finally {
    try { rmdirSync(lock); } catch { /* already gone */ }
  }
}

function isStale(lock) {
  try {
    return Date.now() - statSync(lock).mtimeMs > 5000;
  } catch {
    return true;
  }
}

function update(sessionId, mutate) {
  return withLock(sessionId, () => {
    const turn = readTurn(sessionId) ?? newTurn();
    mutate(turn);
    writeTurn(sessionId, turn);
    return turn;
  });
}

/** Append one data call; creates the turn file if the prompt hook never ran. */
export function appendCall(sessionId, call) {
  return update(sessionId, (t) => {
    t.calls.push({
      venue: call.venue,
      command: call.command,
      symbol: call.symbol ?? null,
      at: call.at ?? new Date().toISOString(),
    });
  });
}

export function setRecord(sessionId, record) {
  return update(sessionId, (t) => {
    t.record = record;
  });
}

/** Most recently modified turn file's session id, or null. */
export function latestSessionId() {
  let best = null;
  let bestMtime = -1;
  let names;
  try {
    names = readdirSync(turnsDir());
  } catch {
    return null;
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const id = sanitizeSessionId(name.slice(0, -5));
    if (!id) continue;
    try {
      const m = statSync(join(turnsDir(), name)).mtimeMs;
      if (m > bestMtime) {
        bestMtime = m;
        best = id;
      }
    } catch { /* raced with a delete */ }
  }
  return best;
}

/** --session flag → CLAUDE_SESSION_ID → newest turn file → null. */
export function resolveSessionId(explicit) {
  return sanitizeSessionId(explicit) ?? sanitizeSessionId(process.env.CLAUDE_SESSION_ID) ?? latestSessionId();
}
