import { TopologyBuilder } from '../src/engine/builder';

/** Three hosts on one switch. h2 runs a web app on port 80 that replies. */
export function oneSwitch() {
  return new TopologyBuilder()
    .host('h1', { ip: '10.0.0.1', prefix: 24 })
    .host('h2', { ip: '10.0.0.2', prefix: 24, apps: [{ name: 'Web', port: 80, reply: 'OK' }] })
    .host('h3', { ip: '10.0.0.3', prefix: 24 })
    .switch('sw', { ports: 4 })
    .connect('h1.eth0', 'sw.p1')
    .connect('h2.eth0', 'sw.p2')
    .connect('h3.eth0', 'sw.p3')
    .build();
}

/** h1 (10.0.0.2/24) -- r1 -- h2 (10.0.1.2/24, web on :80). Hosts are wired straight to the router. */
export function twoNetworks(opts: { h1Gateway?: string | null; h1Prefix?: number } = {}) {
  return new TopologyBuilder()
    .host('h1', {
      ip: '10.0.0.2',
      prefix: opts.h1Prefix ?? 24,
      gateway: opts.h1Gateway === null ? undefined : (opts.h1Gateway ?? '10.0.0.1'),
    })
    .host('h2', {
      ip: '10.0.1.2',
      prefix: 24,
      gateway: '10.0.1.1',
      apps: [{ name: 'Web', port: 80, reply: 'OK' }],
    })
    .router('r1', {
      interfaces: [
        { ip: '10.0.0.1', prefix: 24 },
        { ip: '10.0.1.1', prefix: 24 },
      ],
    })
    .connect('h1.eth0', 'r1.eth0')
    .connect('h2.eth0', 'r1.eth1')
    .build();
}

/**
 * Home network behind a NAT router, and the internet beside it.
 * pc1/pc2 (192.168.1.x) -- home -- eth1 203.0.113.2 -- web (203.0.113.80, :80) and friend (203.0.113.99).
 * nas (192.168.1.50) runs a web app on :80; `forward` publishes it on public port 8080.
 */
export function homeNat(opts: { forward?: boolean } = {}) {
  return new TopologyBuilder()
    .host('pc1', { ip: '192.168.1.10', prefix: 24, gateway: '192.168.1.1' })
    .host('pc2', { ip: '192.168.1.11', prefix: 24, gateway: '192.168.1.1' })
    .host('nas', {
      ip: '192.168.1.50',
      prefix: 24,
      gateway: '192.168.1.1',
      apps: [{ name: 'Web', port: 80, reply: 'nas page' }],
    })
    .host('web', {
      ip: '203.0.113.80',
      prefix: 24,
      apps: [{ name: 'Web', port: 80, reply: 'hello world' }],
    })
    .host('friend', { ip: '203.0.113.99', prefix: 24 })
    .switch('lan', { ports: 4 })
    .switch('net', { ports: 4 })
    .router('home', {
      interfaces: [
        { ip: '192.168.1.1', prefix: 24 },
        { ip: '203.0.113.2', prefix: 24 },
      ],
      nat: {
        outside: 'eth1',
        forwards: opts.forward ? [{ outsidePort: 8080, insideIp: '192.168.1.50', insidePort: 80 }] : [],
      },
    })
    .connect('pc1.eth0', 'lan.p1')
    .connect('pc2.eth0', 'lan.p2')
    .connect('nas.eth0', 'lan.p3')
    .connect('home.eth0', 'lan.p4')
    .connect('home.eth1', 'net.p1')
    .connect('web.eth0', 'net.p2')
    .connect('friend.eth0', 'net.p3')
    .build();
}

/** Three hosts on one hub. h2 runs a web app on port 80 that replies. */
export function oneHub() {
  return new TopologyBuilder()
    .host('h1', { ip: '10.0.0.1', prefix: 24 })
    .host('h2', { ip: '10.0.0.2', prefix: 24, apps: [{ name: 'Web', port: 80, reply: 'OK' }] })
    .host('h3', { ip: '10.0.0.3', prefix: 24 })
    .hub('hub')
    .connect('h1.eth0', 'hub.p1')
    .connect('h2.eth0', 'hub.p2')
    .connect('h3.eth0', 'hub.p3')
    .build();
}
