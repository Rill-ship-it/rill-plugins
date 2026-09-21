import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { childEnv, run, tmpHome } from './helpers.mjs';

test('UserPromptSubmit hook writes a fresh turn file, prints nothing, exits 0', async (t) => {
  const home = tmpHome(t);
  const env = childEnv(home);
  const r = await run('hook-prompt.mjs', [], { env, input: { session_id: 'sess-1', prompt_id: 'p-1', prompt: 'BTC 现在怎么样', cwd: '/x', hook_event_name: 'UserPromptSubmit' } });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '', 'plain stdout would be injected into the model context');
  assert.equal(r.stderr, '');
  const turn = JSON.parse(readFileSync(join(home, 'turns', 'sess-1.json'), 'utf8'));
  assert.equal(turn.prompt_id, 'p-1');
  assert.equal(turn.prompt, 'BTC 现在怎么样');
  assert.deepEqual(turn.calls, []);
  assert.equal(turn.record, null);
  assert.match(turn.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(r.ms < 1500, `took ${r.ms} ms`);
});

test('a new prompt overwrites the previous turn (calls and record reset)', async (t) => {
  const home = tmpHome(t);
  const env = childEnv(home);
  mkdirSync(join(home, 'turns'), { recursive: true });
  writeFileSync(join(home, 'turns', 'sess-2.json'), JSON.stringify({ prompt_id: 'old', prompt: 'old', at: 'x', calls: [{ command: 'snapshot' }], record: { a: 1 } }));
  const r = await run('hook-prompt.mjs', [], { env, input: { session_id: 'sess-2', prompt_id: 'p-2', prompt: 'ETH' } });
  assert.equal(r.code, 0);
  const turn = JSON.parse(readFileSync(join(home, 'turns', 'sess-2.json'), 'utf8'));
  assert.equal(turn.prompt_id, 'p-2');
  assert.deepEqual(turn.calls, []);
  assert.equal(turn.record, null);
});

test('garbage or incomplete input never fails the prompt', async (t) => {
  const home = tmpHome(t);
  const env = childEnv(home);
  for (const input of ['not json', '', { prompt: 'no session' }, { session_id: '../escape', prompt: 'x' }]) {
    const r = await run('hook-prompt.mjs', [], { env, input });
    assert.equal(r.code, 0, `input ${JSON.stringify(input)}`);
    assert.equal(r.stdout, '');
  }
  assert.equal(existsSync(join(home, 'turns')), false, 'nothing written for invalid ids');
});
