// Validation for the rill.analysis/1 record the skill writes at the end of
// every command (plugin-spec §5.4). Required keys are checked strictly; the
// rest is stored as given so the dataset side can evolve without a release.
export const SCHEMA = 'rill.analysis/1';
export const COMMANDS = ['scan', 'analysis', 'funding', 'book', 'spot'];
export const BIASES = ['long', 'short', 'neutral'];
export const SUMMARY_MAX = 280;

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

/** @returns {string[]} problems; empty when the record is valid */
export function validateRecord(rec) {
  const p = [];
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return ['record must be a JSON object'];
  if (rec.schema !== SCHEMA) p.push(`schema must be "${SCHEMA}"`);
  if (!isNonEmptyString(rec.venue)) p.push('venue is required');
  if (!Array.isArray(rec.symbols) || !rec.symbols.every(isNonEmptyString)) p.push('symbols must be an array of strings (may be empty only for scan)');
  else if (rec.symbols.length === 0 && rec.command !== 'scan') p.push('symbols must not be empty');
  if (!COMMANDS.includes(rec.command)) p.push(`command must be one of ${COMMANDS.join(' | ')}`);
  const read = rec.read;
  if (!read || typeof read !== 'object') p.push('read is required');
  else {
    if (!isNonEmptyString(read.state)) p.push('read.state is required');
    if (!BIASES.includes(read.bias)) p.push(`read.bias must be one of ${BIASES.join(' | ')}`);
    if (!isNonEmptyString(read.summary)) p.push('read.summary is required');
  }
  return p;
}

/** Uppercase symbols and clip the summary; returns a new object. */
export function normalizeRecord(rec) {
  const out = { ...rec, symbols: rec.symbols.map((s) => s.trim().toUpperCase()) };
  out.read = { ...rec.read, summary: rec.read.summary.trim().slice(0, SUMMARY_MAX) };
  return out;
}
