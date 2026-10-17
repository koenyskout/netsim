import { describe, expect, it } from 'vitest';
import {
  formatIp,
  networkLabel,
  parseIp,
  parsePrefix,
  prefixToDotted,
  sameNetwork,
} from '../src/engine/addressing';

describe('addressing', () => {
  it('round-trips a valid address', () => {
    expect(formatIp(parseIp('192.168.1.10')!)).toBe('192.168.1.10');
  });
  it('rejects invalid addresses', () => {
    expect(parseIp('300.1.1.1')).toBeNull();
    expect(parseIp('1.2.3')).toBeNull();
    expect(parseIp('a.b.c.d')).toBeNull();
  });
  it('parses masks in the formats students type', () => {
    expect(parsePrefix('24')).toBe(24);
    expect(parsePrefix('/24')).toBe(24);
    expect(parsePrefix('255.255.255.0')).toBe(24);
    expect(parsePrefix('255.255.0.0')).toBe(16);
    expect(parsePrefix('0.0.0.0')).toBe(0);
  });
  it('rejects non-contiguous and out-of-range masks', () => {
    expect(parsePrefix('255.0.255.0')).toBeNull();
    expect(parsePrefix('33')).toBeNull();
    expect(parsePrefix('abc')).toBeNull();
  });
  it('formats a prefix as dotted decimal', () => {
    expect(prefixToDotted(24)).toBe('255.255.255.0');
    expect(prefixToDotted(0)).toBe('0.0.0.0');
    expect(prefixToDotted(32)).toBe('255.255.255.255');
  });
  it('checks whether addresses are in the same network', () => {
    expect(sameNetwork('10.0.0.1', '10.0.0.200', 24)).toBe(true);
    expect(sameNetwork('10.0.0.1', '10.0.1.1', 24)).toBe(false);
    expect(sameNetwork('10.0.0.1', '10.0.1.1', 16)).toBe(true);
    expect(sameNetwork('10.0.0.1', 'nope', 24)).toBe(false);
  });
  it('labels a network', () => {
    expect(networkLabel('192.168.1.77', 24)).toBe('192.168.1.0/24');
  });
});
