/** Parse a dotted-decimal IPv4 address into a 32-bit unsigned number, or null if invalid. */
export function parseIp(text: string): number | null {
  const parts = text.trim().split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

export function formatIp(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

export function isValidIp(text: string): boolean {
  return parseIp(text) !== null;
}

/** The 32-bit mask for a prefix length (0-32). */
export function prefixToMask(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

/** Dotted-decimal form of a prefix length, e.g. 24 -> 255.255.255.0 */
export function prefixToDotted(prefix: number): string {
  return formatIp(prefixToMask(prefix));
}

/**
 * Parse a subnet mask as students may type it: "24", "/24" or "255.255.255.0".
 * Returns the prefix length, or null if invalid (including non-contiguous masks).
 */
export function parsePrefix(text: string): number | null {
  const t = text.trim();
  if (/^\/?\d{1,2}$/.test(t)) {
    const n = Number(t.replace('/', ''));
    return n <= 32 ? n : null;
  }
  const value = parseIp(t);
  if (value === null) return null;
  let prefix = 0;
  while (prefix < 32 && (value & (1 << (31 - prefix))) !== 0) prefix++;
  return prefixToMask(prefix) === value ? prefix : null;
}

export function networkAddress(ip: string, prefix: number): number | null {
  const value = parseIp(ip);
  return value === null ? null : (value & prefixToMask(prefix)) >>> 0;
}

/** True if both addresses are valid and lie in the same network for this prefix. */
export function sameNetwork(a: string, b: string, prefix: number): boolean {
  const na = networkAddress(a, prefix);
  const nb = networkAddress(b, prefix);
  return na !== null && na === nb;
}

/** Human label for the network an address belongs to, e.g. "192.168.1.0/24". */
export function networkLabel(ip: string, prefix: number): string {
  const net = networkAddress(ip, prefix);
  return net === null ? '?' : `${formatIp(net)}/${prefix}`;
}
