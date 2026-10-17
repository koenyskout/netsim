import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/engine/events';
import { simulate } from '../src/engine/simulate';
import { header } from '../src/engine/model';
import type { SendAction } from '../src/engine/model';
import { oneSwitch, twoNetworks } from './fixtures';

const send = (from: string, dstIp: string, dstPort: number): SendAction => ({
  type: 'send',
  from,
  dstIp,
  dstPort,
  message: 'Hello',
});

describe('hosts on a switch', () => {
  it('delivers a message and the app replies', () => {
    const r = simulate(oneSwitch(), send('h1', '10.0.0.2', 80));
    expect(r.outcome).toMatchObject({ delivered: true, replyDelivered: true });
    const deliver = r.events.find((e) => e.kind === 'deliver' && !e.packet.isReply);
    expect(deliver).toMatchObject({ device: 'h2', app: 'Web', port: 80 });
  });

  it('floods when the destination is unknown, and only the destination accepts', () => {
    const r = simulate(oneSwitch(), send('h1', '10.0.0.2', 80));
    const floods = r.events.filter((e) => e.kind === 'flood');
    expect(floods).toHaveLength(1); // the reply is forwarded directly: sw has learned h1
    const ignored = r.events.filter((e) => e.kind === 'drop' && e.device === 'h3');
    expect(ignored).toHaveLength(1);
    expect(ignored[0]).toMatchObject({ reason: 'wrong-mac', significant: false });
  });

  it('remembers learned MAC addresses between runs', () => {
    const first = simulate(oneSwitch(), send('h1', '10.0.0.2', 80));
    expect(first.topology.devices.sw).toMatchObject({ macTable: expect.any(Array) });
    const second = simulate(first.topology, send('h1', '10.0.0.2', 80));
    expect(second.events.filter((e) => e.kind === 'flood')).toHaveLength(0);
  });

  it('does not modify the input topology', () => {
    const topo = oneSwitch();
    simulate(topo, send('h1', '10.0.0.2', 80));
    expect((topo.devices.sw as { macTable: unknown[] }).macTable).toHaveLength(0);
  });

  it('drops at a closed port and says where', () => {
    const r = simulate(oneSwitch(), send('h1', '10.0.0.2', 22));
    expect(r.outcome).toMatchObject({ delivered: false, reason: 'port-closed', device: 'h2' });
  });

  it('reports nobody answering when the address does not exist', () => {
    const r = simulate(oneSwitch(), send('h1', '10.0.0.99', 80));
    expect(r.outcome).toMatchObject({ delivered: false, reason: 'no-arp-reply', device: 'h1' });
  });

  it('drops when the sender has no cable', () => {
    const topo = oneSwitch();
    topo.links = topo.links.filter((l) => l.a.device !== 'h1');
    const r = simulate(topo, send('h1', '10.0.0.2', 80));
    expect(r.outcome).toMatchObject({ delivered: false, reason: 'no-link', device: 'h1' });
  });

  it('wraps the layers in order when sending', () => {
    const r = simulate(oneSwitch(), send('h1', '10.0.0.2', 80));
    const layers = r.events.filter((e) => e.kind === 'add-layer').slice(0, 3);
    expect(layers.map((e) => (e.kind === 'add-layer' ? e.layer : ''))).toEqual([
      'transport',
      'network',
      'link',
    ]);
  });
});

describe('packet identity', () => {
  it('gives flooded copies new ids that point back to the original', () => {
    const r = simulate(oneSwitch(), send('h1', '10.0.0.2', 80));
    const flood = r.events.find((e) => e.kind === 'flood')!;
    const copies = r.events.filter((e) => e.kind === 'transmit' && e.copyOf === flood.pid);
    expect(copies).toHaveLength(2); // h2 and h3
    expect(new Set(copies.map((e) => e.pid)).size).toBe(2);
    expect(copies.every((e) => e.pid !== flood.pid)).toBe(true);
  });

  it('keeps one id for a packet that is forwarded, and a new id for the reply', () => {
    const r = simulate(twoNetworks(), send('h1', '10.0.1.2', 80));
    const request = r.events.filter((e) => e.kind === 'transmit' && !e.packet.isReply);
    expect(new Set(request.map((e) => e.pid)).size).toBe(1);
    const reply = r.events.find((e) => e.kind === 'create' && e.packet.isReply)!;
    expect(reply.pid).not.toBe(request[0].pid);
  });

  it('shows the source MAC swap before the destination MAC swap', () => {
    const topo = twoNetworks();
    const r = simulate(topo, send('h1', '10.0.1.2', 80));
    const [first, second] = r.events.filter(
      (e): e is Extract<SimEvent, { kind: 'rewrite' }> => e.kind === 'rewrite' && !e.packet.isReply,
    );
    const firstHop = r.events.find((e): e is Extract<SimEvent, { kind: 'transmit' }> => e.kind === 'transmit')!;
    const before = firstHop.packet;
    const afterFirst = header(first.packet, 'link')!;
    const afterSecond = header(second.packet, 'link')!;
    // First event: source changed, destination still the router's own MAC.
    expect(afterFirst.srcMac).not.toBe(header(before, 'link')!.srcMac);
    expect(afterFirst.dstMac).toBe(header(before, 'link')!.dstMac);
    // Second event: destination now changed too.
    expect(afterSecond.srcMac).toBe(afterFirst.srcMac);
    expect(afterSecond.dstMac).toBe(topo.devices.h2.interfaces[0].mac);
  });
});

describe('routing between two networks', () => {
  it('delivers across the router', () => {
    const r = simulate(twoNetworks(), send('h1', '10.0.1.2', 80));
    expect(r.outcome).toMatchObject({ delivered: true, replyDelivered: true });
  });

  it('keeps the IPs and changes the MACs at the router', () => {
    const topo = twoNetworks();
    const r = simulate(topo, send('h1', '10.0.1.2', 80));
    const hops = r.events.filter((e) => e.kind === 'transmit' && !e.packet.isReply);
    expect(hops).toHaveLength(2);
    const [first, second] = hops.map((e) => (e.kind === 'transmit' ? e.packet : null)!);
    expect(header(first, 'network')).toEqual(header(second, 'network'));
    expect(header(first, 'network')).toMatchObject({ srcIp: '10.0.0.2', dstIp: '10.0.1.2' });
    const l1 = header(first, 'link')!;
    const l2 = header(second, 'link')!;
    expect(l2.srcMac).not.toBe(l1.srcMac);
    expect(l2.dstMac).not.toBe(l1.dstMac);
    const h2mac = topo.devices.h2.interfaces[0].mac;
    expect(l2.dstMac).toBe(h2mac);
    const rewrites = r.events.filter((e) => e.kind === 'rewrite' && !e.packet.isReply);
    expect(rewrites.map((e) => (e.kind === 'rewrite' ? e.field : ''))).toEqual(['srcMac', 'dstMac']);
  });

  it('fails without a default gateway', () => {
    const r = simulate(twoNetworks({ h1Gateway: null }), send('h1', '10.0.1.2', 80));
    expect(r.outcome).toMatchObject({ delivered: false, reason: 'no-gateway', device: 'h1' });
  });

  it('fails with a gateway that is not on the local network', () => {
    const r = simulate(twoNetworks({ h1Gateway: '10.0.5.1' }), send('h1', '10.0.1.2', 80));
    expect(r.outcome).toMatchObject({ delivered: false, reason: 'gateway-unreachable' });
  });

  it('fails with a mask that makes a remote host look local', () => {
    const r = simulate(twoNetworks({ h1Prefix: 16 }), send('h1', '10.0.1.2', 80));
    expect(r.outcome).toMatchObject({ delivered: false, reason: 'no-arp-reply', device: 'h1' });
  });

  it('fails when the router has no route', () => {
    const r = simulate(twoNetworks(), send('h1', '10.0.9.9', 80));
    expect(r.outcome).toMatchObject({ delivered: false, reason: 'no-route', device: 'r1' });
  });

  describe('static routes via another router', () => {
    function threeHops(returnRoute: boolean) {
      const topo = twoNetworks();
      const r1 = topo.devices.r1;
      if (r1.kind !== 'router') throw new Error('expected router');
      r1.interfaces[1].ip = '10.9.0.1';
      r1.routes.push({ network: '10.0.1.0', prefix: 24, via: '10.9.0.2' });
      topo.devices.r2 = {
        kind: 'router',
        id: 'r2',
        name: 'r2',
        interfaces: [
          { id: 'eth0', mac: '02:00:00:00:00:F0', ip: '10.9.0.2', prefix: 24 },
          { id: 'eth1', mac: '02:00:00:00:00:F1', ip: '10.0.1.1', prefix: 24 },
        ],
        routes: returnRoute ? [{ network: '10.0.0.0', prefix: 24, via: '10.9.0.1' }] : [],
      };
      topo.links = [
        { a: { device: 'h1', iface: 'eth0' }, b: { device: 'r1', iface: 'eth0' } },
        { a: { device: 'r1', iface: 'eth1' }, b: { device: 'r2', iface: 'eth0' } },
        { a: { device: 'r2', iface: 'eth1' }, b: { device: 'h2', iface: 'eth0' } },
      ];
      return topo;
    }

    it('forwards over several hops and back', () => {
      const r = simulate(threeHops(true), send('h1', '10.0.1.2', 80));
      expect(r.outcome).toMatchObject({ delivered: true, replyDelivered: true });
      expect(r.events.filter((e) => e.kind === 'transmit' && !e.packet.isReply)).toHaveLength(3);
    });

    it('delivers the message but loses the reply if the way back is unknown', () => {
      const r = simulate(threeHops(false), send('h1', '10.0.1.2', 80));
      expect(r.outcome).toMatchObject({
        delivered: true,
        replyDelivered: false,
        replyReason: 'no-route',
        replyDevice: 'r2',
      });
    });
  });
});
