import { describe, expect, it } from 'vitest';
import { simulate } from '../src/engine/simulate';
import { header } from '../src/engine/model';
import type { SendAction } from '../src/engine/model';
import { Timeline } from '../src/engine/timeline';
import { homeNat } from './fixtures';

const send = (from: string, dstIp: string, dstPort: number, srcPort?: number): SendAction => ({
  type: 'send',
  from,
  dstIp,
  dstPort,
  message: 'Hello',
  srcPort,
});

describe('NAT: inside to outside', () => {
  it('delivers, and the server only ever sees the public address', () => {
    const r = simulate(homeNat(), send('pc1', '203.0.113.80', 80));
    expect(r.outcome).toMatchObject({ delivered: true, replyDelivered: true });
    const arrival = r.events.find((e) => e.kind === 'transmit' && e.to.device === 'net' && !e.packet.isReply && e.device === 'home');
    const net = header(arrival!.kind === 'transmit' ? arrival!.packet : r.events[0].kind === 'create' ? r.events[0].packet : { headers: [], message: '' }, 'network');
    expect(net).toMatchObject({ srcIp: '203.0.113.2', dstIp: '203.0.113.80' });
  });

  it('rewrites source IP and port, and writes the table', () => {
    const r = simulate(homeNat(), send('pc1', '203.0.113.80', 80, 49152));
    const nat = r.events.filter((e) => e.kind === 'nat');
    expect(nat).toHaveLength(2);
    expect(nat[0]).toMatchObject({
      direction: 'out',
      created: true,
      changes: [
        { field: 'srcIp', from: '192.168.1.10', to: '203.0.113.2' },
        { field: 'srcPort', from: 49152, to: 40000 },
      ],
    });
    expect(nat[1]).toMatchObject({
      direction: 'in',
      changes: [
        { field: 'dstIp', from: '203.0.113.2', to: '192.168.1.10' },
        { field: 'dstPort', from: 40000, to: 49152 },
      ],
    });
    const home = r.topology.devices.home;
    expect(home.kind === 'router' && home.nat?.table).toEqual([
      { insideIp: '192.168.1.10', insidePort: 49152, outsidePort: 40000 },
    ]);
  });

  it('gives two inside hosts with the same source port different public ports', () => {
    const first = simulate(homeNat(), send('pc1', '203.0.113.80', 80, 49152));
    const second = simulate(first.topology, send('pc2', '203.0.113.80', 80, 49152));
    const out = second.events.find((e) => e.kind === 'nat' && e.direction === 'out');
    expect(out).toMatchObject({ changes: [{}, { field: 'srcPort', to: 40001 }] });
    expect(second.outcome).toMatchObject({ delivered: true, replyDelivered: true });
  });

  it('reuses the entry for the same conversation', () => {
    const first = simulate(homeNat(), send('pc1', '203.0.113.80', 80, 49152));
    const second = simulate(first.topology, send('pc1', '203.0.113.80', 80, 49152));
    const out = second.events.find((e) => e.kind === 'nat' && e.direction === 'out');
    expect(out).toMatchObject({ created: false, changes: [{}, { to: 40000 }] });
  });

  it('does not translate traffic that stays inside', () => {
    const r = simulate(homeNat(), send('pc1', '192.168.1.50', 80));
    expect(r.events.some((e) => e.kind === 'nat')).toBe(false);
    expect(r.outcome.delivered).toBe(true);
  });

  it('leaves the NAT router transparent to MAC handling (link layer rebuilt)', () => {
    const r = simulate(homeNat(), send('pc1', '203.0.113.80', 80));
    expect(r.events.filter((e) => e.kind === 'rewrite' && !e.packet.isReply)).toHaveLength(2);
  });
});

describe('NAT: outside to inside', () => {
  it('drops unsolicited traffic with no mapping', () => {
    const r = simulate(homeNat(), send('friend', '203.0.113.2', 80));
    expect(r.outcome).toMatchObject({ delivered: false, reason: 'no-mapping', device: 'home' });
  });

  it('follows a port forwarding rule, and the reply leaves from the public port', () => {
    const r = simulate(homeNat({ forward: true }), send('friend', '203.0.113.2', 8080, 50000));
    expect(r.outcome).toMatchObject({ delivered: true, replyDelivered: true });
    const deliver = r.events.find((e) => e.kind === 'deliver' && !e.packet.isReply);
    expect(deliver).toMatchObject({ device: 'nas', port: 80 });
    const reply = r.events.find((e) => e.kind === 'nat' && e.direction === 'out');
    expect(reply).toMatchObject({
      row: 'fwd:8080',
      created: false,
      changes: [{ field: 'srcIp', to: '203.0.113.2' }, { field: 'srcPort', to: 8080 }],
    });
  });

  it('ignores forwarding rules for other ports', () => {
    const r = simulate(homeNat({ forward: true }), send('friend', '203.0.113.2', 80));
    expect(r.outcome).toMatchObject({ delivered: false, reason: 'no-mapping' });
  });

  it('still reports a closed port behind the forward', () => {
    const topo = homeNat({ forward: true });
    const nas = topo.devices.nas;
    if (nas.kind === 'host') nas.apps = [];
    const r = simulate(topo, send('friend', '203.0.113.2', 8080));
    expect(r.outcome).toMatchObject({ delivered: false, reason: 'port-closed', device: 'nas' });
  });
});

describe('NAT tables in the timeline', () => {
  it('shows the table as it was at each position', () => {
    const r = simulate(homeNat(), send('pc1', '203.0.113.80', 80));
    const t = new Timeline(r);
    expect(t.natTables().home).toEqual([]);
    t.seek(r.events.length);
    expect(t.natTables().home).toHaveLength(1);
  });
});
