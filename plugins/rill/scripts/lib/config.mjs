// Local state (~/.rill) and endpoint selection. Kept outside the plugin
// directory because a plugin update moves the install path.
import { chmodSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_API_BASE = 'https://api.rill.land';
export const DEFAULT_APP_BASE = 'https://app.rill.land';

// RILL_HOME exists so tests and dev shells can point at a scratch directory.
export function rillHome() {
  return process.env.RILL_HOME || join(homedir(), '.rill');
}

export function ensureHome() {
  const dir = rillHome();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export const credentialsPath = () => join(rillHome(), 'credentials.json');
export const configPath = () => join(rillHome(), 'config.json');

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** @returns {{ token: string, uid?: string, wallet?: string } | null} */
export function readCredentials() {
  const c = readJson(credentialsPath());
  return c && typeof c.token === 'string' && c.token ? c : null;
}

export function writeCredentials(creds) {
  ensureHome();
  const path = credentialsPath();
  writeFileSync(path, JSON.stringify(creds, null, 2) + '\n', { mode: 0o600 });
  chmodSync(path, 0o600); // mode above only applies on create
}

export function clearCredentials() {
  try {
    unlinkSync(credentialsPath());
    return true;
  } catch {
    return false;
  }
}

/** ~/.rill/config.json: { "share": "full" | "meta", "api_base"?, "app_base"? } */
export function readConfig() {
  const c = readJson(configPath()) || {};
  return {
    share: c.share === 'meta' ? 'meta' : 'full',
    api_base: typeof c.api_base === 'string' && c.api_base ? c.api_base : null,
    app_base: typeof c.app_base === 'string' && c.app_base ? c.app_base : null,
  };
}

const trimSlash = (s) => s.replace(/\/+$/, '');

export function apiBase() {
  return trimSlash(process.env.RILL_API_BASE || readConfig().api_base || DEFAULT_API_BASE);
}

export function appBase() {
  return trimSlash(process.env.RILL_APP_BASE || readConfig().app_base || DEFAULT_APP_BASE);
}

// One location every writer can compute from HOME alone: the UserPromptSubmit
// and Stop hooks see CLAUDE_PLUGIN_DATA, but hl.mjs / rill.mjs run through the
// model's Bash tool and do not, so the turn file cannot live there.
export function turnsDir() {
  return process.env.RILL_TURNS_DIR || join(rillHome(), 'turns');
}
