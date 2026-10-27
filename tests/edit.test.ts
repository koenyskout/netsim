import { describe, expect, it } from 'vitest';
import { addDevice, connectDevices, freeSpot, removeDevice } from '../src/engine/edit';
import { decodeHash, encodeHash, exportScene, parseScene } from '../src/engine/share';
import { simulate } from '../src/engine/simulate';
import { presets } from '../src/presets';
import type { Topology } from '../src/engine/model';

const empty = (): Topology => ({ devices: {}, links: [] });

describe('editing a network', () => {
  it('adds devices with unique ids, names and MACs', () => {
    const t = empty();
    const a = addDevice(t, 'host');
    const b = addDevice(t, 'host');
    const s = addDevice(t, 'switch');
    const r = addDevice(t, 'router');
    expect([a, b, s, r]).toEqual(['pc1', 'pc2', 'sw1', 'r1']);
    expect(t.devices.pc2.name).toBe('PC2');
    const macs = Object.values(t.devices).flatMap((d) => d.interfaces.map((i) => i.mac));
    expect(new Set(macs).size).toBe(macs.length);
  });

  it('connects on the first free interface and refuses a second cable on a host', () => {
    const t = empty();
    addDevice(t, 'host');
    addDevice(t, 'host');
    addDevice(t, 'switch');
    expect(connectDevices(t, 'pc1', 'sw1')).toBeNull();
    expect(connectDevices(t, 'pc2', 'sw1')).toBeNull();
    expect(t.links[1]).toEqual({ a: { device: 'pc2', iface: 'eth0' }, b: { device: 'sw1', iface: 'p2' } });
    expect(connectDevices(t, 'pc1', 'sw1')).toMatch(/only one network port/);
    expect(connectDevices(t, 'pc1', 'pc1')).toMatch(/two different/);
    expect(t.links).toHaveLength(2);
  });

  it('grows a switch with more ports when it is full, up to a limit', () => {
    const t = empty();
    addDevice(t, 'switch');
    for (let i = 0; i < 8; i++) {
      const h = addDevice(t, 'host');
      expect(connectDevices(t, h, 'sw1')).toBeNull();
    }
    const h = addDevice(t, 'host');
    expect(connectDevices(t, h, 'sw1')).toMatch(/no free port/);
    expect(t.devices.sw1.interfaces).toHaveLength(8);
  });

  it('removes a device together with its cables', () => {
    const t = empty();
    addDevice(t, 'host');
    addDevice(t, 'switch');
    connectDevices(t, 'pc1', 'sw1');
    removeDevice(t, 'sw1');
    expect(t.links).toHaveLength(0);
    expect(Object.keys(t.devices)).toEqual(['pc1']);
  });

  it('a network built from scratch can send a message', () => {
    const t = empty();
    addDevice(t, 'host');
    addDevice(t, 'host');
    addDevice(t, 'switch');
    connectDevices(t, 'pc1', 'sw1');
    connectDevices(t, 'pc2', 'sw1');
    const [a, b] = [t.devices.pc1, t.devices.pc2];
    if (a.kind !== 'host' || b.kind !== 'host') throw new Error();
    a.interfaces[0].ip = '10.0.0.1';
    a.interfaces[0].prefix = 24;
    b.interfaces[0].ip = '10.0.0.2';
    b.interfaces[0].prefix = 24;
    b.apps.push({ name: 'Web', port: 80 });
    const r = simulate(t, { type: 'send', from: 'pc1', dstIp: '10.0.0.2', dstPort: 80, message: 'hi' });
    expect(r.outcome.delivered).toBe(true);
  });

  it('finds free spots', () => {
    const p = { a: freeSpot({}) };
    const q = freeSpot(p);
    expect(q).not.toEqual(p.a);
  });
});

describe('sharing', () => {
  it('round-trips every preset through JSON and through the URL hash', () => {
    for (const p of presets) {
      const scene = { topology: p.topology, positions: p.positions };
      const viaJson = parseScene(exportScene(scene));
      expect(viaJson.ok, p.id).toBe(true);
      if (!viaJson.ok) continue;
      expect(viaJson.scene.topology, p.id).toEqual(p.topology);
      expect(viaJson.scene.positions, p.id).toEqual(p.positions);
      const viaHash = decodeHash('#' + encodeHash(scene));
      expect(viaHash && viaHash.ok && viaHash.scene.topology, p.id).toEqual(p.topology);
    }
  });

  it('leaves learned tables out', () => {
    const p = presets.find((x) => x.id === 'nat')!;
    const action = p.suggestions[0].action;
    const run = simulate(p.topology, action);
    const text = exportScene({ topology: run.topology, positions: p.positions });
    expect(text).not.toContain('arpTable');
    const parsed = parseScene(text);
    expect(parsed.ok && parsed.scene.topology).toEqual(p.topology);
  });

  it('ignores a hash without a network, and reports damaged ones', () => {
    expect(decodeHash('')).toBeNull();
    expect(decodeHash('#other')).toBeNull();
    const bad = decodeHash('#s=!!!');
    expect(bad && !bad.ok).toBe(true);
  });

  it.each([
    ['not json', '{'],
    ['no devices', '{"links":[]}'],
    ['bad ip', '{"devices":{"a":{"kind":"host","id":"a","name":"A","interfaces":[{"id":"eth0","mac":"x","ip":"300.1.1.1"}]}},"links":[]}'],
    [
      'cable to nowhere',
      '{"devices":{"a":{"kind":"host","id":"a","name":"A","interfaces":[{"id":"eth0","mac":"x"}]}},"links":[{"a":{"device":"a","iface":"eth0"},"b":{"device":"zz","iface":"p1"}}]}',
    ],
  ])('rejects %s with a message', (_name, text) => {
    const r = parseScene(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
  });

  it('fills in missing positions', () => {
    const r = parseScene(
      '{"devices":{"a":{"kind":"host","id":"a","name":"A","interfaces":[{"id":"eth0","mac":"x"}]}},"links":[]}',
    );
    expect(r.ok && r.scene.positions.a).toBeTruthy();
  });
});

import { shortName } from '../src/engine/share';
describe('short links', () => {
  it('recognises names but not scene links', () => {
    expect(shortName('#nat-demo')).toBe('nat-demo');
    expect(shortName('#/nat')).toBe('nat');
    expect(shortName('#s=abc')).toBeNull();
    expect(shortName('')).toBeNull();
    expect(shortName('#../x')).toBeNull();
  });
});
