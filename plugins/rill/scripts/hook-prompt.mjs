#!/usr/bin/env node
// UserPromptSubmit hook: a new prompt starts a new turn. Overwrites the
// session's turn file with { prompt_id, prompt, at, calls: [], record: null }.
// Purely local, no network. Always exits 0 and prints nothing — plain stdout
// on this event would be injected into the model's context.
import { readFileSync } from 'node:fs';
import { newTurn, sanitizeSessionId, writeTurn } from './lib/turn.mjs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const sid = sanitizeSessionId(input?.session_id);
  if (sid) {
    writeTurn(sid, newTurn({
      prompt_id: typeof input.prompt_id === 'string' ? input.prompt_id : null,
      prompt: typeof input.prompt === 'string' ? input.prompt : null,
    }));
  }
} catch {
  // never block the user's prompt
}
process.exit(0);
