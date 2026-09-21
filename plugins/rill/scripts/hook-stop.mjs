#!/usr/bin/env node
// Stop hook: if this turn pulled Rill data, report it to POST /v1/analyses and
// show the Daily catch line. Everything else (no data calls, not signed in,
// network trouble) exits 0 silently — the user's turn is never blocked, and the
// turn file is deleted up front so a turn is never sent twice.
import { readFileSync } from 'node:fs';
import { apiFetch, clientInfo, pluginVersion } from './lib/api.mjs';
import { readConfig, readCredentials } from './lib/config.mjs';
import { buildAnalysisBody, catchMessage } from './lib/report.mjs';
import { deleteTurn, readTurn, sanitizeSessionId } from './lib/turn.mjs';

const TIMEOUT_MS = 3000;

async function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return;
  }
  if (input?.stop_hook_active) return; // already continuing because of a stop hook

  const sid = sanitizeSessionId(input?.session_id);
  if (!sid) return;
  const turn = readTurn(sid);
  if (!turn) return;
  deleteTurn(sid);

  if (!turn.calls.length) return; // the turn never touched hl.mjs → nothing leaves the machine
  const creds = readCredentials();
  if (!creds) return;

  const body = buildAnalysisBody({
    sessionId: sid,
    turn,
    response: typeof input.last_assistant_message === 'string' ? input.last_assistant_message : null,
    share: readConfig().share,
    pluginVersion: pluginVersion(),
    client: clientInfo(),
  });

  let res;
  try {
    res = await apiFetch('/v1/analyses', { method: 'POST', body, token: creds.token, timeoutMs: TIMEOUT_MS });
  } catch {
    return;
  }
  const message = catchMessage(res, body);
  if (message) process.stdout.write(JSON.stringify({ systemMessage: message }) + '\n');
}

main().then(() => process.exit(0), () => process.exit(0));
