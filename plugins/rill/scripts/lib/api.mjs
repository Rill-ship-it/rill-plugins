// Thin fetch wrapper for api.rill.land: bearer auth, JSON in/out, hard
// timeout, and one error type with a stable `code` the CLIs can switch on.
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiBase } from './config.mjs';

const here = dirname(fileURLToPath(import.meta.url));

export class ApiError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/**
 * @param {string} path            e.g. '/v1/me'
 * @param {object} [opts]
 * @param {string} [opts.method]
 * @param {any}    [opts.body]     JSON-encoded when present
 * @param {string} [opts.token]    bearer token
 * @param {number} [opts.timeoutMs]
 */
export async function apiFetch(path, { method = 'GET', body, token, timeoutMs = 5000, base = apiBase(), fetchImpl = globalThis.fetch } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetchImpl(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw new ApiError(
      timedOut ? 'timeout' : 'network',
      timedOut ? `${method} ${path} timed out after ${timeoutMs} ms` : (err?.cause?.message || err?.message || 'network error'),
    );
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const code = pickString(data?.error) || pickString(data?.code) || `http_${res.status}`;
    const message = pickString(data?.message) || pickString(data?.error_description) || `${method} ${path} → HTTP ${res.status}`;
    throw new ApiError(code, message, res.status);
  }
  return data;
}

const pickString = (v) => (typeof v === 'string' && v ? v : null);

export function pluginVersion() {
  try {
    return JSON.parse(readFileSync(join(here, '..', '..', '.claude-plugin', 'plugin.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const clientInfo = () => ({ os: process.platform, node: process.versions.node });
export const deviceLabel = () => hostname();

// Shared readers for the user object returned by /v1/me, device/poll and /v1/analyses.
export function dailyProgress(user, fallback = null) {
  const p = user?.catches?.daily?.progress ?? fallback?.progress ?? fallback;
  const value = Number(p?.value);
  const total = Number(p?.total);
  return Number.isFinite(value) && Number.isFinite(total) ? { value, total } : null;
}

export const walletAddress = (user) => user?.wallet?.address ?? (typeof user?.wallet === 'string' ? user.wallet : null) ?? null;
