import { describe, expect, it } from 'vitest';
import { simulate } from '../src/engine/simulate';
import { Timeline } from '../src/engine/timeline';
import { oneSwitch } from './fixtures';

const run = () =>
  simulate(oneSwitch(), { type: 'send', from: 'h1', dstIp: '10.0.0.2', dstPort: 80, message: 'Hi' });

describe('Timeline', () => {
  it('steps forward and backward', () => {
    const t = new Timeline(run());
    expect(t.atStart).toBe(true);
    expect(t.current).toBeNull();
    t.next();
    expect(t.current?.kind).toBe('create');
    t.next();
    t.prev();
    expect(t.position).toBe(1);
    expect(t.prev()).toBe(true);
    expect(t.prev()).toBe(false);
  });

  it('clamps seek to the valid range', () => {
    const t = new Timeline(run());
    t.seek(9999);
    expect(t.atEnd).toBe(true);
    t.seek(-5);
    expect(t.atStart).toBe(true);
  });

  it('jumps by hop', () => {
    const t = new Timeline(run());
    t.nextHop();
    expect(t.current?.kind).toBe('transmit');
    const afterFirst = t.position;
    t.nextHop();
    expect(t.current?.kind).toBe('transmit');
    expect(t.position).toBeGreaterThan(afterFirst);
    t.prevHop();
    expect(t.position).toBe(afterFirst);
    t.prevHop();
    expect(t.atStart).toBe(true);
  });

  it('shows MAC tables as they were at each step', () => {
    const t = new Timeline(run());
    expect(t.macTables().sw).toEqual([]);
    const learnIndex = t.events.findIndex((e) => e.kind === 'learn');
    t.seek(learnIndex); // just before the switch learns
    expect(t.macTables().sw).toEqual([]);
    t.seek(learnIndex + 1);
    expect(t.macTables().sw).toHaveLength(1);
    t.seek(0);
    expect(t.macTables().sw).toEqual([]);
  });
});
