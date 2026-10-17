import { isValidIp, parsePrefix } from '../engine/addressing';

export type Parsed = { ok: true; value: string | undefined } | { ok: false; error: string };

/** An IP address, or empty for "none". */
export function parseIpField(text: string): Parsed {
  const t = text.trim();
  if (t === '') return { ok: true, value: undefined };
  return isValidIp(t) ? { ok: true, value: t } : { ok: false, error: 'Four numbers 0–255 separated by dots, e.g. 192.168.1.10' };
}

/** A subnet mask as "24", "/24" or "255.255.255.0"; the value is the prefix length as text. */
export function parseMaskField(text: string): Parsed {
  const t = text.trim();
  if (t === '') return { ok: true, value: undefined };
  const p = parsePrefix(t);
  return p === null
    ? { ok: false, error: 'Use a number like 24 or a mask like 255.255.255.0' }
    : { ok: true, value: String(p) };
}

export function parsePortField(text: string): Parsed {
  const n = Number(text.trim());
  return Number.isInteger(n) && n >= 1 && n <= 65535
    ? { ok: true, value: String(n) }
    : { ok: false, error: 'A port is a number from 1 to 65535' };
}
