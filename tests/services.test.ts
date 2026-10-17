import { describe, expect, it } from 'vitest';
import { TopologyBuilder } from '../src/engine/builder';
import { simulate } from '../src/engine/simulate';

/** One switch: a DHCP+DNS server, a web server and two computers without an address. */
function lan() {
  return new TopologyBuilder()
    .host('srv', {
      name: 'Server',
      ip: '192.168.1.2',
      prefix: 24,
      dhcp: { first: '192.168.1.100', last: '192.168.1.101', prefix: 24, gateway: '192.168.1.1', dns: '192.168.1.2' },
      dnsRecords: [{ name: 'www.example.org', ip: '192.168.1.80' }],
    })
    .host('web', { ip: '192.168.1.80', prefix: 24, apps: [{ name: 'Web', port: 80, reply: 'page' }] })
    .host('pc1', {})
    .host('pc2', {})
    .switch('sw', { ports: 4 })
    .router('r', { interfaces: [{ ip: '192.168.1.1', prefix: 24 }, { ip: '10.0.0.1', prefix: 24 }] })
    .host('far', {})
    .connect('srv.eth0', 'sw.p1')
    .connect('web.eth0', 'sw.p2')
    .connect('pc1.eth0', 'sw.p3')
    .connect('pc2.eth0', 'sw.p4')
    .connect('far.eth0', 'r.eth1')
    .build();
}

const dhcp = (from: string) => ({ type: 'dhcp' as const, from });

describe('DHCP', () => {
  it('gives a computer an address, gateway and DNS server', () => {
    const r = simulate(lan(), dhcp('pc1'));
    expect(r.outcome.delivered).toBe(true);
    const pc = r.topology.devices.pc1;
    if (pc.kind !== 'host') throw new Error();
    expect(pc.interfaces[0]).toMatchObject({ ip: '192.168.1.100', prefix: 24 });
    expect(pc.gateway).toBe('192.168.1.1');
    expect(pc.dnsServer).toBe('192.168.1.2');
    expect(r.events.some((e) => e.kind === 'configure')).toBe(true);
  });

  it('hands out different addresses, remembers leases, and runs out', () => {
    const a = simulate(lan(), dhcp('pc1'));
    const b = simulate(a.topology, dhcp('pc2'));
    const again = simulate(b.topology, dhcp('pc1'));
    const ip = (r: typeof a, id: string) => {
      const d = r.topology.devices[id];
      return d.kind === 'host' ? d.interfaces[0].ip : undefined;
    };
    expect(ip(b, 'pc2')).toBe('192.168.1.101');
    expect(ip(again, 'pc1')).toBe('192.168.1.100');
    const t = again.topology;
    const far = simulate(t, dhcp('far'));
    expect(far.outcome.delivered).toBe(false);
  });

  it('is not answered across a router: broadcasts stay local', () => {
    const r = simulate(lan(), dhcp('far'));
    expect(r.outcome.delivered).toBe(false);
    expect(r.events.some((e) => e.kind === 'drop' && e.reason === 'broadcast')).toBe(true);
  });

  it('the first run does not change the input topology', () => {
    const t = lan();
    simulate(t, dhcp('pc1'));
    const srv = t.devices.srv;
    expect(srv.kind === 'host' && srv.dhcpServer?.leases).toEqual([]);
  });
});

describe('DNS', () => {
  const configured = () => simulate(lan(), dhcp('pc1')).topology;

  it('asks the DNS server, then sends the real message', () => {
    const r = simulate(configured(), { type: 'send', from: 'pc1', dstIp: '', dstName: 'www.example.org', dstPort: 80, message: 'GET /' });
    expect(r.outcome.delivered).toBe(true);
    expect(r.outcome.replyDelivered).toBe(true);
    expect(r.events.some((e) => e.kind === 'lookup' && e.table === 'dns' && e.result === '192.168.1.80')).toBe(true);
    const creates = r.events.filter((e) => e.kind === 'create');
    expect(creates.length).toBeGreaterThanOrEqual(3);
  });

  it('reports an unknown name', () => {
    const r = simulate(configured(), { type: 'send', from: 'pc1', dstIp: '', dstName: 'nope.example', dstPort: 80, message: 'x' });
    expect(r.outcome).toMatchObject({ delivered: false, reason: 'name-not-found', device: 'pc1' });
  });

  it('reports a missing DNS server', () => {
    const t = lan();
    const pc = t.devices.pc1;
    if (pc.kind !== 'host') throw new Error();
    pc.interfaces[0].ip = '192.168.1.50';
    pc.interfaces[0].prefix = 24;
    const r = simulate(t, { type: 'send', from: 'pc1', dstIp: '', dstName: 'www.example.org', dstPort: 80, message: 'x' });
    expect(r.outcome).toMatchObject({ delivered: false, reason: 'no-dns-server' });
  });

  it('plain IP sends are unaffected', () => {
    const r = simulate(configured(), { type: 'send', from: 'pc1', dstIp: '192.168.1.80', dstPort: 80, message: 'x' });
    expect(r.outcome.delivered).toBe(true);
  });
});
