import type { App, DhcpServer, Device, DnsRecord, Host, Interface, Link, PortForward, Route, Topology } from './model';

export interface HostOptions {
  name?: string;
  ip?: string;
  prefix?: number;
  gateway?: string;
  apps?: App[];
  dnsServer?: string;
  /** Makes this host a DNS server with these names. */
  dnsRecords?: DnsRecord[];
  /** Makes this host a DHCP server handing out addresses from first..last. */
  dhcp?: Omit<DhcpServer, 'leases'>;
}

export interface RouterOptions {
  name?: string;
  /** One entry per interface; ids default to eth0, eth1, ... */
  interfaces: { id?: string; ip?: string; prefix?: number }[];
  routes?: Route[];
  /** Turn on NAT; `outside` is the interface facing the internet. */
  nat?: { outside: string; forwards?: PortForward[] };
}

/** Small fluent helper to assemble topologies (used by presets and tests). */
export class TopologyBuilder {
  private devices: Record<string, Device> = {};
  private links: Link[] = [];
  private macCounter = 1;

  private mac(): string {
    const n = this.macCounter++;
    return `02:00:00:00:00:${n.toString(16).toUpperCase().padStart(2, '0')}`;
  }

  private add(device: Device): this {
    if (this.devices[device.id]) throw new Error(`Duplicate device id ${device.id}`);
    this.devices[device.id] = device;
    return this;
  }

  host(id: string, opts: HostOptions = {}): this {
    const iface: Interface = { id: 'eth0', mac: this.mac(), ip: opts.ip, prefix: opts.prefix };
    const host: Host = {
      kind: 'host',
      id,
      name: opts.name ?? id,
      interfaces: [iface],
      gateway: opts.gateway,
      apps: opts.apps ?? [],
      ...(opts.dnsServer ? { dnsServer: opts.dnsServer } : {}),
      ...(opts.dnsRecords ? { dnsRecords: opts.dnsRecords } : {}),
      ...(opts.dhcp ? { dhcpServer: { ...opts.dhcp, leases: [] } } : {}),
    };
    return this.add(host);
  }

  switch(id: string, opts: { name?: string; ports?: number } = {}): this {
    const interfaces = Array.from({ length: opts.ports ?? 4 }, (_, i) => ({
      id: `p${i + 1}`,
      mac: this.mac(),
    }));
    return this.add({ kind: 'switch', id, name: opts.name ?? id, interfaces, macTable: [] });
  }

  router(id: string, opts: RouterOptions): this {
    const interfaces = opts.interfaces.map((i, n) => ({
      id: i.id ?? `eth${n}`,
      mac: this.mac(),
      ip: i.ip,
      prefix: i.prefix,
    }));
    return this.add({
      kind: 'router',
      id,
      name: opts.name ?? id,
      interfaces,
      routes: opts.routes ?? [],
      ...(opts.nat ? { nat: { outside: opts.nat.outside, forwards: opts.nat.forwards ?? [], table: [] } } : {}),
    });
  }

  /** Connect two interfaces, written as "device.iface", e.g. connect('h1.eth0', 'sw.p1'). */
  connect(a: string, b: string): this {
    const [ea, eb] = [a, b].map((text) => {
      const [device, iface] = text.split('.');
      const d = this.devices[device];
      if (!d?.interfaces.some((i) => i.id === iface)) throw new Error(`Unknown interface ${text}`);
      if (this.links.some((l) => [l.a, l.b].some((e) => e.device === device && e.iface === iface))) {
        throw new Error(`Interface ${text} is already connected`);
      }
      return { device, iface };
    });
    this.links.push({ a: ea, b: eb });
    return this;
  }

  build(): Topology {
    return { devices: this.devices, links: this.links };
  }
}
