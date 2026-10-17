import { describe, expect, it } from 'vitest';
import { simulate } from '../src/engine/simulate';
import { sceneAt } from '../src/ui/scene';
import { oneSwitch, twoNetworks } from './fixtures';

const run = (topo = oneSwitch(), to = '10.0.0.2') =>
  simulate(topo, { type: 'send', from: 'h1', dstIp: to, dstPort: 80, message: 'Hi' });

describe('sceneAt', () => {
  it('is empty before anything happens', () => {
    const s = sceneAt(run().events, 0);
    expect(s.tokens).toEqual([]);
    expect(s.focus).toBeNull();
    expect(s.event).toBeNull();
  });

  it('shows one token wrapped step by step on the sending host', () => {
    const { events } = run();
    const afterLink = events.findIndex((e) => e.kind === 'add-layer' && e.layer === 'link') + 1;
    const s = sceneAt(events, afterLink);
    expect(s.tokens).toHaveLength(1);
    expect(s.tokens[0].device).toBe('h1');
    expect(s.tokens[0].packet.headers.map((h) => h.layer)).toEqual(['link', 'network', 'transport']);
    expect(s.activeLayer).toBe('link');
  });

  it('moves the token to the receiving device on transmit and lights the cable', () => {
    const { events } = run();
    const i = events.findIndex((e) => e.kind === 'transmit') + 1;
    const s = sceneAt(events, i);
    expect(s.tokens[0].device).toBe('sw');
    expect(s.litLink).toMatchObject({ from: 'h1', to: 'sw', toIface: 'p1' });
  });

  it('replaces the token with one copy per port when the switch floods', () => {
    const { events } = run();
    const lastCopyTransmit = events.map((e) => e.kind === 'transmit' && e.copyOf !== undefined).lastIndexOf(true);
    const s = sceneAt(events, lastCopyTransmit + 1);
    expect(s.tokens.map((t) => t.device).sort()).toEqual(['h2', 'h3']);
    expect(s.tokens.find((t) => t.device === 'h2')?.spawnFrom).toBe('sw');
  });

  it('shows ignored flooded copies only while they are the current event', () => {
    const { events } = run();
    const i = events.findIndex((e) => e.kind === 'drop' && e.device === 'h3');
    const during = sceneAt(events, i + 1);
    expect(during.tokens.some((t) => t.device === 'h3' && t.status === 'dropped')).toBe(true);
    const after = sceneAt(events, events.length);
    expect(after.tokens.some((t) => t.device === 'h3')).toBe(false);
  });

  it('keeps a token that was really dropped on screen at the end', () => {
    const r = run(twoNetworks(), '10.0.9.9');
    const s = sceneAt(r.events, r.events.length);
    expect(s.tokens).toHaveLength(1);
    expect(s.tokens[0]).toMatchObject({ device: 'r1', status: 'dropped' });
  });

  it('marks the layer being opened', () => {
    const { events } = run();
    const i = events.findIndex((e) => e.kind === 'open-layer' && e.device === 'h2') + 1;
    const s = sceneAt(events, i);
    expect(s.focus?.opening).toBe('link');
  });
});
