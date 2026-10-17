import { sameNetwork, networkLabel, parseIp, networkAddress, formatIp } from './addressing';
import { captions } from './explain';
import type { Outcome, SimEvent, SimResult } from './events';
import { getInterface, peerOf, resolveMac } from './graph';
import { connectedKey, forwardKey, natKey, staticKey } from './routes';
import {
  BROADCAST_MAC,
  INSIGNIFICANT_DROPS,
  LIMITED_BROADCAST,
  header,
  type Action,
  type App,
  type DropReason,
  type Header,
  type Host,
  type MacEntry,
  type NatEntry,
  type Packet,
  type Router,
  type SendAction,
  type Switch,
  type Topology,
} from './model';

const MAX_TRANSMITS = 64;
const DEFAULT_SRC_PORT = 49152;
const DNS_PORT = 53;
const DNS_CLIENT_PORT = 53000;
const DHCP_SERVER_PORT = 67;
const DHCP_CLIENT_PORT = 68;

interface Pending {
  device: string;
  iface: string;
  packet: Packet;
  pid: number;
}

interface Ctx {
  topo: Topology;
  events: SimEvent[];
  queue: Pending[];
  transmits: number;
  nextPid: number;
  /** Sockets opened by sending apps during this run, so replies find their way back. */
  sockets: Map<string, string>;
  /** Messages waiting for a DNS answer, by the asking host and port. */
  waiting: Map<string, Outgoing>;
}

/**
 * Run one action on a topology and return the full list of events.
 * Pure: the input topology is not modified; the returned topology carries
 * what the switches learned.
 */
export function simulate(before: Topology, action: Action): SimResult {
  const topo = structuredClone(before);
  const ctx: Ctx = { topo, events: [], queue: [], transmits: 0, nextPid: 1, sockets: new Map(), waiting: new Map() };

  const initialMacTables: Record<string, MacEntry[]> = {};
  for (const d of Object.values(before.devices)) {
    if (d.kind === 'switch') initialMacTables[d.id] = structuredClone(d.macTable);
  }

  const sender = topo.devices[action.from];
  if (sender?.kind !== 'host') throw new Error(`${action.from} is not a host`);
  if (action.type === 'dhcp') {
    startDhcp(ctx, sender);
  } else {
    const out: Outgoing = {
      app: action.app ?? 'client',
      srcPort: action.srcPort ?? DEFAULT_SRC_PORT,
      dstIp: action.dstIp,
      dstPort: action.dstPort,
      message: action.message,
      isReply: false,
    };
    if (action.dstName?.trim()) startNameSend(ctx, sender, action.dstName.trim(), out);
    else sendFromHost(ctx, sender, out);
  }

  while (ctx.queue.length > 0) receive(ctx, ctx.queue.shift()!);

  const initialNatTables: Record<string, NatEntry[]> = {};
  for (const d of Object.values(before.devices)) {
    if (d.kind === 'router' && d.nat) initialNatTables[d.id] = structuredClone(d.nat.table);
  }

  return {
    events: ctx.events,
    topology: topo,
    initialMacTables,
    initialNatTables,
    outcome: action.type === 'dhcp' ? dhcpOutcome(ctx.events, sender.id) : outcomeOf(ctx.events),
  };
}

// ---- helpers ----

function name(ctx: Ctx, id: string): string {
  return ctx.topo.devices[id].name;
}

function drop(ctx: Ctx, device: string, reason: DropReason, packet: Packet, pid: number): void {
  ctx.events.push({
    kind: 'drop',
    device,
    pid,
    reason,
    significant: !INSIGNIFICANT_DROPS.includes(reason),
    packet,
    caption: captions.dropped(name(ctx, device), reason),
  });
}

function transmit(
  ctx: Ctx,
  device: string,
  iface: string,
  packet: Packet,
  pid: number,
  copyOf?: number,
): void {
  const peer = peerOf(ctx.topo, device, iface);
  if (!peer) return drop(ctx, device, 'no-link', packet, pid);
  if (ctx.transmits >= MAX_TRANSMITS) return drop(ctx, device, 'loop', packet, pid);
  ctx.transmits++;
  ctx.events.push({
    kind: 'transmit',
    device,
    pid,
    iface,
    to: peer,
    packet,
    copyOf,
    caption: captions.transmit(name(ctx, device), name(ctx, peer.device)),
  });
  ctx.queue.push({ device: peer.device, iface: peer.iface, packet, pid });
}

/** Remove the outermost header. */
function strip(packet: Packet): Packet {
  return { ...packet, headers: packet.headers.slice(1) };
}

function withLink(packet: Packet, srcMac: string, dstMac: string): Packet {
  const rest = packet.headers.filter((h) => h.layer !== 'link');
  const link: Header = { layer: 'link', srcMac, dstMac };
  return { ...packet, headers: [link, ...rest] };
}

/** Replace the header of the given layer, keeping the order. */
function replaceHeader(packet: Packet, next: Header): Packet {
  return { ...packet, headers: packet.headers.map((h) => (h.layer === next.layer ? next : h)) };
}

// ---- sending ----

interface Outgoing {
  app: string;
  srcPort: number;
  dstIp: string;
  dstPort: number;
  message: string;
  isReply: boolean;
  service?: 'dns' | 'dhcp';
  data?: Record<string, string>;
  /** Replaces the usual caption of the first step. */
  caption?: string;
  /** Send out of this interface instead of choosing one by the destination. */
  iface?: string;
  /** Use this source IP instead of the interface's (a computer without an address uses 0.0.0.0). */
  srcIp?: string;
  /** Use this destination MAC instead of looking one up. */
  dstMac?: string;
}

/** The applications of a host, including the ones a DNS or DHCP server role implies. */
function appsOf(host: Host): (App & { service?: 'dns' | 'dhcp' })[] {
  const apps: (App & { service?: 'dns' | 'dhcp' })[] = [...host.apps];
  if (host.dnsRecords) apps.push({ name: 'DNS server', port: DNS_PORT, service: 'dns' });
  if (host.dhcpServer) apps.push({ name: 'DHCP server', port: DHCP_SERVER_PORT, service: 'dhcp' });
  return apps;
}

function sendFromHost(ctx: Ctx, host: Host, out: Outgoing): void {
  const pid = ctx.nextPid++;
  ctx.sockets.set(`${host.id}:${out.srcPort}`, out.app);
  let packet: Packet = {
    headers: [],
    message: out.message,
    isReply: out.isReply,
    ...(out.service ? { service: out.service } : {}),
    ...(out.data ? { data: out.data } : {}),
  };
  ctx.events.push({
    kind: 'create',
    device: host.id,
    pid,
    app: out.app,
    packet,
    caption: out.caption ?? captions.create(host.name, out.app, out.message),
  });

  const forced = out.iface ? host.interfaces.find((i) => i.id === out.iface) : undefined;
  const configured = host.interfaces.filter((i) => i.ip && i.prefix !== undefined);
  if (!forced && configured.length === 0) return drop(ctx, host.id, 'no-ip', packet, pid);
  if (forced && !forced.ip && !out.srcIp) return drop(ctx, host.id, 'no-ip', packet, pid);

  // Decide: is the destination on one of my networks, or do I need the gateway?
  let egress = forced ?? configured.find((i) => sameNetwork(i.ip!, out.dstIp, i.prefix!));
  let nextHop = out.dstIp;
  if (!egress) {
    if (!host.gateway) return drop(ctx, host.id, 'no-gateway', packet, pid);
    egress = configured.find((i) => sameNetwork(i.ip!, host.gateway!, i.prefix!));
    if (!egress) return drop(ctx, host.id, 'gateway-unreachable', packet, pid);
    nextHop = host.gateway;
  }

  const transport: Header = { layer: 'transport', srcPort: out.srcPort, dstPort: out.dstPort };
  packet = { ...packet, headers: [transport] };
  ctx.events.push({
    kind: 'add-layer',
    device: host.id,
    pid,
    layer: 'transport',
    packet,
    caption: captions.transport(out.srcPort, out.dstPort),
  });

  const srcIp = out.srcIp ?? egress.ip!;
  const network: Header = { layer: 'network', srcIp, dstIp: out.dstIp };
  packet = { ...packet, headers: [network, transport] };
  ctx.events.push({
    kind: 'add-layer',
    device: host.id,
    pid,
    layer: 'network',
    packet,
    caption: captions.network(srcIp, out.dstIp),
  });

  if (!peerOf(ctx.topo, host.id, egress.id)) return drop(ctx, host.id, 'no-link', packet, pid);
  let dstMac = out.dstMac;
  if (!dstMac) {
    const found = resolveMac(ctx.topo, host.id, egress.id, nextHop);
    if (!found) return drop(ctx, host.id, 'no-arp-reply', packet, pid);
    dstMac = found;
    ctx.events.push({
      kind: 'lookup',
      device: host.id,
      pid,
      table: 'arp',
      key: nextHop,
      result: dstMac,
      row: nextHop,
      packet,
      caption: captions.arp(host.name, nextHop, dstMac),
    });
  }

  packet = withLink(packet, egress.mac, dstMac);
  ctx.events.push({
    kind: 'add-layer',
    device: host.id,
    pid,
    layer: 'link',
    packet,
    caption: captions.link(egress.mac, dstMac),
  });
  transmit(ctx, host.id, egress.id, packet, pid);
}

// ---- receiving ----

function receive(ctx: Ctx, p: Pending): void {
  const device = ctx.topo.devices[p.device];
  if (device.kind === 'switch') receiveSwitch(ctx, device, p);
  else if (device.kind === 'router') receiveRouter(ctx, device, p);
  else receiveHost(ctx, device, p);
}

function openLink(ctx: Ctx, p: Pending) {
  const device = ctx.topo.devices[p.device];
  ctx.events.push({
    kind: 'open-layer',
    device: p.device,
    pid: p.pid,
    layer: 'link',
    packet: p.packet,
    caption: captions.open(device.name, 'link', device.kind),
  });
  return header(p.packet, 'link')!;
}

function receiveSwitch(ctx: Ctx, sw: Switch, p: Pending): void {
  const pid = p.pid;
  const link = openLink(ctx, p);

  if (link.srcMac !== BROADCAST_MAC) {
    const existing = sw.macTable.find((e) => e.mac === link.srcMac);
    if (existing) existing.port = p.iface;
    else sw.macTable.push({ mac: link.srcMac, port: p.iface });
    ctx.events.push({
      kind: 'learn',
      device: sw.id,
      pid,
      mac: link.srcMac,
      port: p.iface,
      macTable: structuredClone(sw.macTable),
      caption: captions.learn(link.srcMac, p.iface),
    });
  }

  const known =
    link.dstMac === BROADCAST_MAC ? undefined : sw.macTable.find((e) => e.mac === link.dstMac);
  if (link.dstMac !== BROADCAST_MAC) {
    ctx.events.push({
      kind: 'lookup',
      device: sw.id,
      pid,
      table: 'mac',
      key: link.dstMac,
      result: known?.port ?? null,
      row: known?.mac ?? null,
      packet: p.packet,
      caption: captions.macLookup(link.dstMac, known?.port ?? null),
    });
  }

  if (known) {
    if (known.port === p.iface) return drop(ctx, sw.id, 'filtered', p.packet, pid);
    return transmit(ctx, sw.id, known.port, p.packet, pid);
  }

  const ports = sw.interfaces
    .filter((i) => i.id !== p.iface && peerOf(ctx.topo, sw.id, i.id))
    .map((i) => i.id);
  ctx.events.push({
    kind: 'flood',
    device: sw.id,
    pid,
    ports,
    packet: p.packet,
    caption: captions.flood(link.dstMac, ports),
  });
  for (const port of ports) transmit(ctx, sw.id, port, p.packet, ctx.nextPid++, pid);
}

function receiveHost(ctx: Ctx, host: Host, p: Pending): void {
  const pid = p.pid;
  const iface = getInterface(host, p.iface);
  const link = openLink(ctx, p);
  if (link.dstMac !== iface.mac && link.dstMac !== BROADCAST_MAC) {
    return drop(ctx, host.id, 'wrong-mac', p.packet, pid);
  }

  let packet = strip(p.packet);
  ctx.events.push({
    kind: 'open-layer',
    device: host.id,
    pid,
    layer: 'network',
    packet,
    caption: captions.open(host.name, 'network', 'host'),
  });
  const net = header(packet, 'network')!;
  const broadcast = net.dstIp === LIMITED_BROADCAST;
  // A computer that has no address yet must still accept the DHCP answer meant for it.
  const awaitingAddress = !iface.ip && packet.service === 'dhcp' && Boolean(packet.isReply);
  if (net.dstIp !== iface.ip && !broadcast && !awaitingAddress) return drop(ctx, host.id, 'wrong-ip', packet, pid);

  packet = strip(packet);
  ctx.events.push({
    kind: 'open-layer',
    device: host.id,
    pid,
    layer: 'transport',
    packet,
    caption: captions.open(host.name, 'transport', 'host'),
  });
  const transport = header(packet, 'transport')!;

  const app = appsOf(host).find((a) => a.port === transport.dstPort);
  const socketApp = ctx.sockets.get(`${host.id}:${transport.dstPort}`);
  const appName = app?.name ?? socketApp;
  ctx.events.push({
    kind: 'lookup',
    device: host.id,
    pid,
    table: 'socket',
    key: String(transport.dstPort),
    result: appName ?? null,
    row: appName ? String(transport.dstPort) : null,
    packet,
    caption: appName
      ? `Port ${transport.dstPort} belongs to the ${appName} application.`
      : `No application has opened port ${transport.dstPort}.`,
  });
  if (!appName) return drop(ctx, host.id, broadcast ? 'ignored' : 'port-closed', packet, pid);

  packet = strip(packet);
  ctx.events.push({
    kind: 'deliver',
    device: host.id,
    pid,
    app: appName,
    port: transport.dstPort,
    packet,
    caption: captions.deliver(host.name, appName, transport.dstPort),
  });

  const reply = Boolean(p.packet.isReply);
  if (app?.service === 'dns' && !reply) return answerDns(ctx, host, packet, net.srcIp, transport.srcPort, pid);
  if (app?.service === 'dhcp' && !reply) return answerDhcp(ctx, host, p);
  if (reply && packet.service === 'dns') return continueAfterDns(ctx, host, packet, pid);
  if (reply && packet.service === 'dhcp') return applyDhcp(ctx, host, iface.id, packet, pid);

  if (app?.reply !== undefined && !p.packet.isReply) {
    sendFromHost(ctx, host, {
      app: app.name,
      srcPort: app.port,
      dstIp: net.srcIp,
      dstPort: transport.srcPort,
      message: app.reply,
      isReply: true,
    });
  }
}

interface RouteMatch {
  row: string;
  prefix: number;
  /** Interface to send out of. */
  egress: string;
  nextHop: string;
  via: string | null;
}

function lookupRoute(router: Router, dstIp: string): RouteMatch | null {
  const dst = parseIp(dstIp);
  if (dst === null) return null;
  let best: RouteMatch | null = null;
  const consider = (m: RouteMatch) => {
    if (!best || m.prefix > best.prefix) best = m;
  };
  for (const i of router.interfaces) {
    if (i.ip && i.prefix !== undefined && sameNetwork(i.ip, dstIp, i.prefix)) {
      consider({
        row: connectedKey(i.id),
        prefix: i.prefix,
        egress: i.id,
        nextHop: dstIp,
        via: null,
      });
    }
  }
  for (const r of router.routes) {
    if (networkAddress(dstIp, r.prefix) !== networkAddress(r.network, r.prefix)) continue;
    const egress = r.via
      ? router.interfaces.find((i) => i.ip && i.prefix !== undefined && sameNetwork(i.ip, r.via!, i.prefix))
      : undefined;
    consider({
      row: staticKey(r.network, r.prefix),
      prefix: r.prefix,
      egress: egress?.id ?? '',
      nextHop: r.via ?? dstIp,
      via: r.via ?? null,
    });
  }
  return best;
}

function receiveRouter(ctx: Ctx, router: Router, p: Pending): void {
  const pid = p.pid;
  const inIface = getInterface(router, p.iface);
  const link = openLink(ctx, p);
  if (link.dstMac !== inIface.mac && link.dstMac !== BROADCAST_MAC) {
    return drop(ctx, router.id, 'wrong-mac', p.packet, pid);
  }

  let packet = strip(p.packet);
  ctx.events.push({
    kind: 'open-layer',
    device: router.id,
    pid,
    layer: 'network',
    packet,
    caption: captions.open(router.name, 'network', 'router'),
  });
  const net = header(packet, 'network')!;

  if (net.dstIp === LIMITED_BROADCAST) return drop(ctx, router.id, 'broadcast', packet, pid);

  // Packets from the internet addressed to the shared public address: translate or drop.
  const nat = router.nat;
  const outsideIface = nat ? router.interfaces.find((i) => i.id === nat.outside) : undefined;
  if (nat && outsideIface?.ip && p.iface === outsideIface.id && net.dstIp === outsideIface.ip) {
    const translated = natInbound(ctx, router, packet, pid);
    if (!translated) return;
    packet = translated;
  } else if (router.interfaces.some((i) => i.ip === net.dstIp)) {
    // Packets addressed to the router itself: routers run no applications here.
    return drop(ctx, router.id, 'port-closed', packet, pid);
  }
  const dstIp = header(packet, 'network')!.dstIp;

  const match = lookupRoute(router, dstIp);
  const label = match
    ? match.row.startsWith('connected:')
      ? (() => {
          const i = getInterface(router, match.egress);
          return networkLabel(i.ip!, i.prefix!);
        })()
      : match.row.slice('route:'.length)
    : null;
  ctx.events.push({
    kind: 'lookup',
    device: router.id,
    pid,
    table: 'route',
    key: dstIp,
    result: match ? match.egress || null : null,
    row: match?.row ?? null,
    packet,
    caption: captions.route(dstIp, label, match?.via ?? null),
  });
  if (!match) return drop(ctx, router.id, 'no-route', packet, pid);
  if (!match.egress) return drop(ctx, router.id, 'gateway-unreachable', packet, pid);

  const out = getInterface(router, match.egress);
  if (!peerOf(ctx.topo, router.id, out.id)) return drop(ctx, router.id, 'no-link', packet, pid);
  if (nat && out.id === nat.outside && p.iface !== nat.outside) {
    const translated = natOutbound(ctx, router, packet, pid, out.ip);
    if (!translated) return;
    packet = translated;
  }
  const dstMac = resolveMac(ctx.topo, router.id, out.id, match.nextHop);
  if (!dstMac) return drop(ctx, router.id, 'no-arp-reply', packet, pid);

  // Rebuild the link layer for the next network: new MAC addresses, same IPs.
  const rewritten = withLink(packet, out.mac, dstMac);
  ctx.events.push({
    kind: 'rewrite',
    device: router.id,
    pid,
    layer: 'link',
    field: 'srcMac',
    from: link.srcMac,
    to: out.mac,
    packet: withLink(packet, out.mac, link.dstMac),
    caption: captions.rewrite(router.name, 'srcMac', link.srcMac, out.mac),
  });
  ctx.events.push({
    kind: 'rewrite',
    device: router.id,
    pid,
    layer: 'link',
    field: 'dstMac',
    from: link.dstMac,
    to: dstMac,
    packet: rewritten,
    caption: captions.rewrite(router.name, 'dstMac', link.dstMac, dstMac),
  });
  transmit(ctx, router.id, out.id, rewritten, pid);
}

// ---- DNS ----

/** Ask the DNS server for a name first; the real message follows once the answer is in. */
function startNameSend(ctx: Ctx, host: Host, dstName: string, out: Outgoing): void {
  if (!host.dnsServer) {
    const pid = ctx.nextPid++;
    const packet: Packet = { headers: [], message: `Where is ${dstName}?`, service: 'dns' };
    ctx.events.push({
      kind: 'create',
      device: host.id,
      pid,
      app: 'DNS client',
      packet,
      caption: captions.create(host.name, 'DNS client', packet.message),
    });
    return drop(ctx, host.id, 'no-dns-server', packet, pid);
  }
  ctx.waiting.set(`${host.id}:${DNS_CLIENT_PORT}`, out);
  sendFromHost(ctx, host, {
    app: 'DNS client',
    srcPort: DNS_CLIENT_PORT,
    dstIp: host.dnsServer,
    dstPort: DNS_PORT,
    message: `Where is ${dstName}?`,
    isReply: false,
    service: 'dns',
    data: { name: dstName },
  });
}

function answerDns(ctx: Ctx, server: Host, packet: Packet, clientIp: string, clientPort: number, pid: number): void {
  const wanted = packet.data?.name ?? '';
  const record = server.dnsRecords?.find((r) => r.name.toLowerCase() === wanted.toLowerCase());
  ctx.events.push({
    kind: 'lookup',
    device: server.id,
    pid,
    table: 'dns',
    key: wanted,
    result: record?.ip ?? null,
    row: record?.name ?? null,
    packet,
    caption: captions.dnsLookup(wanted, record?.ip ?? null),
  });
  sendFromHost(ctx, server, {
    app: 'DNS server',
    srcPort: DNS_PORT,
    dstIp: clientIp,
    dstPort: clientPort,
    message: record ? `${record.name} is at ${record.ip}` : `I do not know ${wanted}`,
    isReply: true,
    service: 'dns',
    data: record ? { name: wanted, ip: record.ip } : { name: wanted },
  });
}

function continueAfterDns(ctx: Ctx, host: Host, packet: Packet, pid: number): void {
  const key = `${host.id}:${DNS_CLIENT_PORT}`;
  const out = ctx.waiting.get(key);
  if (!out) return;
  ctx.waiting.delete(key);
  const ip = packet.data?.ip;
  if (!ip) return drop(ctx, host.id, 'name-not-found', packet, pid);
  sendFromHost(ctx, host, { ...out, dstIp: ip, caption: captions.resolved(host.name, packet.data?.name ?? '', ip) });
}

// ---- DHCP ----

function startDhcp(ctx: Ctx, host: Host): void {
  const iface = host.interfaces.find((i) => peerOf(ctx.topo, host.id, i.id)) ?? host.interfaces[0];
  sendFromHost(ctx, host, {
    app: 'DHCP client',
    srcPort: DHCP_CLIENT_PORT,
    dstIp: LIMITED_BROADCAST,
    dstPort: DHCP_SERVER_PORT,
    message: 'Is there a DHCP server? I need an address.',
    isReply: false,
    service: 'dhcp',
    iface: iface.id,
    srcIp: '0.0.0.0',
    dstMac: BROADCAST_MAC,
  });
}

function answerDhcp(ctx: Ctx, server: Host, p: Pending): void {
  const cfg = server.dhcpServer!;
  const pid = p.pid;
  const clientMac = header(p.packet, 'link')!.srcMac;
  const ownIps = new Set(server.interfaces.map((i) => i.ip));
  let lease = cfg.leases.find((l) => l.mac === clientMac);
  const known = lease !== undefined;
  if (!lease) {
    const first = parseIp(cfg.first);
    const last = parseIp(cfg.last);
    for (let n = first ?? 1; first !== null && last !== null && n <= last && !lease; n++) {
      const ip = formatIp(n);
      if (!ownIps.has(ip) && !cfg.leases.some((l) => l.ip === ip)) lease = { mac: clientMac, ip };
    }
    if (!lease) return drop(ctx, server.id, 'pool-empty', strip(strip(strip(p.packet))), pid);
    cfg.leases.push(lease);
  }
  ctx.events.push({
    kind: 'lookup',
    device: server.id,
    pid,
    table: 'dhcp',
    key: clientMac,
    result: lease.ip,
    row: lease.mac,
    packet: strip(strip(strip(p.packet))),
    caption: captions.dhcpPick(clientMac, lease.ip, known),
  });
  sendFromHost(ctx, server, {
    app: 'DHCP server',
    srcPort: DHCP_SERVER_PORT,
    dstIp: lease.ip,
    dstPort: DHCP_CLIENT_PORT,
    message: `You can use ${lease.ip}/${cfg.prefix}`,
    isReply: true,
    service: 'dhcp',
    data: {
      ip: lease.ip,
      prefix: String(cfg.prefix),
      ...(cfg.gateway ? { gateway: cfg.gateway } : {}),
      ...(cfg.dns ? { dns: cfg.dns } : {}),
    },
    iface: p.iface,
    dstMac: clientMac,
  });
}

function applyDhcp(ctx: Ctx, host: Host, ifaceId: string, packet: Packet, pid: number): void {
  const d = packet.data;
  if (!d?.ip) return;
  const iface = getInterface(host, ifaceId);
  iface.ip = d.ip;
  iface.prefix = Number(d.prefix);
  if (d.gateway) host.gateway = d.gateway;
  if (d.dns) host.dnsServer = d.dns;
  ctx.events.push({
    kind: 'configure',
    device: host.id,
    pid,
    iface: iface.id,
    ip: d.ip,
    prefix: iface.prefix,
    gateway: d.gateway,
    dns: d.dns,
    packet,
    caption: captions.configure(host.name, d.ip, iface.prefix, d.gateway, d.dns),
  });
}

// ---- NAT ----

function openTransport(ctx: Ctx, router: Router, packet: Packet, pid: number): void {
  ctx.events.push({
    kind: 'open-layer',
    device: router.id,
    pid,
    layer: 'transport',
    packet,
    caption: captions.open(router.name, 'transport', 'router'),
  });
}

/** Inside to outside: swap the private source for the public address and a public port. */
function natOutbound(ctx: Ctx, router: Router, packet: Packet, pid: number, publicIp?: string): Packet | null {
  const nat = router.nat!;
  const net = header(packet, 'network')!;
  const tr = header(packet, 'transport')!;
  if (!publicIp) {
    drop(ctx, router.id, 'no-ip', packet, pid);
    return null;
  }
  openTransport(ctx, router, packet, pid);

  const forward = nat.forwards.find((f) => f.insideIp === net.srcIp && f.insidePort === tr.srcPort);
  let outsidePort: number;
  let created = false;
  let row: string;
  if (forward) {
    outsidePort = forward.outsidePort;
    row = forwardKey(outsidePort);
  } else {
    let entry = nat.table.find((e) => e.insideIp === net.srcIp && e.insidePort === tr.srcPort);
    if (!entry) {
      let port = 40000;
      while (nat.table.some((e) => e.outsidePort === port) || nat.forwards.some((f) => f.outsidePort === port)) port++;
      entry = { insideIp: net.srcIp, insidePort: tr.srcPort, outsidePort: port };
      nat.table.push(entry);
      created = true;
    }
    outsidePort = entry.outsidePort;
    row = natKey(outsidePort);
  }

  const translated = replaceHeader(
    replaceHeader(packet, { layer: 'network', srcIp: publicIp, dstIp: net.dstIp }),
    { layer: 'transport', srcPort: outsidePort, dstPort: tr.dstPort },
  );
  ctx.events.push({
    kind: 'nat',
    device: router.id,
    pid,
    direction: 'out',
    changes: [
      { field: 'srcIp', from: net.srcIp, to: publicIp },
      { field: 'srcPort', from: tr.srcPort, to: outsidePort },
    ],
    row,
    created,
    packet: translated,
    natTable: structuredClone(nat.table),
    caption: forward
      ? captions.natForwardOut(router.name, net.srcIp, tr.srcPort, publicIp, outsidePort)
      : captions.natOut(router.name, net.srcIp, tr.srcPort, publicIp, outsidePort, created),
  });
  return translated;
}

/** Outside to inside: find who the public port belongs to, or drop. */
function natInbound(ctx: Ctx, router: Router, packet: Packet, pid: number): Packet | null {
  const nat = router.nat!;
  const net = header(packet, 'network')!;
  const tr = header(packet, 'transport')!;
  openTransport(ctx, router, packet, pid);

  const entry = nat.table.find((e) => e.outsidePort === tr.dstPort);
  const forward = entry ? undefined : nat.forwards.find((f) => f.outsidePort === tr.dstPort);
  const target = entry
    ? { ip: entry.insideIp, port: entry.insidePort, row: natKey(entry.outsidePort) }
    : forward
      ? { ip: forward.insideIp, port: forward.insidePort, row: forwardKey(forward.outsidePort) }
      : null;
  if (!target) {
    ctx.events.push({
      kind: 'lookup',
      device: router.id,
      pid,
      table: 'nat',
      key: String(tr.dstPort),
      result: null,
      row: null,
      packet,
      caption: `${router.name} looks for public port ${tr.dstPort} in its NAT table and port forwarding rules: nothing.`,
    });
    drop(ctx, router.id, 'no-mapping', packet, pid);
    return null;
  }

  const translated = replaceHeader(
    replaceHeader(packet, { layer: 'network', srcIp: net.srcIp, dstIp: target.ip }),
    { layer: 'transport', srcPort: tr.srcPort, dstPort: target.port },
  );
  ctx.events.push({
    kind: 'nat',
    device: router.id,
    pid,
    direction: 'in',
    changes: [
      { field: 'dstIp', from: net.dstIp, to: target.ip },
      { field: 'dstPort', from: tr.dstPort, to: target.port },
    ],
    row: target.row,
    created: false,
    packet: translated,
    natTable: structuredClone(nat.table),
    caption: entry
      ? captions.natIn(router.name, tr.dstPort, target.ip, target.port)
      : captions.natForwardIn(router.name, tr.dstPort, target.ip, target.port),
  });
  return translated;
}

// ---- outcome ----

function dhcpOutcome(events: SimEvent[], hostId: string): Outcome {
  const configured = events.find((e) => e.kind === 'configure');
  if (configured?.kind === 'configure') {
    return {
      delivered: true,
      note: `✓ Got an address. ${configured.caption}`,
    };
  }
  const failed = [...events].reverse().find((e) => e.kind === 'drop' && e.significant);
  if (failed?.kind === 'drop') return { delivered: false, reason: failed.reason, device: failed.device };
  return { delivered: false, reason: 'ignored', device: hostId, note: 'Nobody answered: there is no DHCP server on this network. Broadcasts never cross a router.' };
}

function outcomeOf(allEvents: SimEvent[]): Outcome {
  const outcome: Outcome = { delivered: false };
  // Helper protocols (DNS) are not the message the student sent; judge only the real one.
  const events = allEvents.filter((e) => !('packet' in e && e.packet.service));
  const mainStarted = events.some((e) => e.kind === 'create');
  if (!mainStarted) {
    const d = [...allEvents].reverse().find((e) => e.kind === 'drop' && e.significant);
    if (d?.kind === 'drop') return { delivered: false, reason: d.reason, device: d.device };
    return outcome;
  }
  for (const e of events) {
    if (e.kind === 'deliver') {
      if (e.packet && !isReply(e)) outcome.delivered = true;
      else outcome.replyDelivered = true;
    }
  }
  const lastDrop = (reply: boolean) =>
    [...events]
      .reverse()
      .find((e) => e.kind === 'drop' && e.significant && Boolean(e.packet.isReply) === reply);
  if (!outcome.delivered) {
    const d = lastDrop(false);
    if (d?.kind === 'drop') {
      outcome.reason = d.reason;
      outcome.device = d.device;
    }
  } else if (events.some((e) => e.kind === 'create' && e.packet.isReply)) {
    outcome.replyDelivered = outcome.replyDelivered ?? false;
    if (!outcome.replyDelivered) {
      const d = lastDrop(true);
      if (d?.kind === 'drop') {
        outcome.replyReason = d.reason;
        outcome.replyDevice = d.device;
      }
    }
  }
  return outcome;
}

function isReply(e: SimEvent): boolean {
  return 'packet' in e && Boolean(e.packet.isReply);
}
