import { isValidIp } from './addressing';
import { freeSpot, type Positions } from './edit';
import type { App, DhcpServer, Device, DnsRecord, Interface, Topology } from './model';

/** A network and where its devices sit on the stage: what gets saved, exported and shared. */
export interface Scene {
  topology: Topology;
  positions: Positions;
}

const FORMAT = 'netsim/1';

export type ParseResult = { ok: true; scene: Scene } | { ok: false; error: string };

/** Learned state (MAC tables, NAT table) is not part of the design, so it is left out. */
export function exportScene(scene: Scene): string {
  const devices: Record<string, unknown> = {};
  for (const [id, d] of Object.entries(scene.topology.devices)) {
    if (d.kind === 'switch') devices[id] = { ...d, macTable: [] };
    else if (d.kind === 'host' && d.dhcpServer) devices[id] = { ...d, dhcpServer: { ...d.dhcpServer, leases: [] } };
    else if (d.kind === 'router' && d.nat) devices[id] = { ...d, nat: { ...d.nat, table: [] } };
    else devices[id] = d;
  }
  return JSON.stringify({ format: FORMAT, devices, links: scene.topology.links, positions: scene.positions }, null, 2);
}

const fail = (error: string): ParseResult => ({ ok: false, error });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isPort = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 65535;

function parseInterface(v: unknown, where: string): Interface | string {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.mac)) return `${where}: an interface needs an id and a mac.`;
  const iface: Interface = { id: v.id, mac: v.mac };
  if (v.ip !== undefined) {
    if (!isStr(v.ip) || !isValidIp(v.ip)) return `${where}: ${String(v.ip)} is not a valid IP address.`;
    iface.ip = v.ip;
  }
  if (v.prefix !== undefined) {
    if (!Number.isInteger(v.prefix) || (v.prefix as number) < 0 || (v.prefix as number) > 32) {
      return `${where}: the prefix must be a whole number from 0 to 32.`;
    }
    iface.prefix = v.prefix as number;
  }
  return iface;
}

/** Check untrusted JSON thoroughly: it may come from a link or a file. */
export function parseScene(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail('This is not valid JSON.');
  }
  if (!isObj(data) || !isObj(data.devices) || !Array.isArray(data.links)) {
    return fail('This does not look like a NetSim network (devices and links are missing).');
  }
  if (data.format !== undefined && data.format !== FORMAT) return fail(`Unknown format ${String(data.format)}.`);

  const devices: Record<string, Device> = {};
  const entries = Object.entries(data.devices);
  if (entries.length === 0) return fail('The network has no devices.');
  if (entries.length > 40) return fail('The network is too big (at most 40 devices).');

  for (const [id, raw] of entries) {
    if (!isObj(raw) || raw.id !== id || !isStr(raw.name)) return fail(`Device ${id}: needs an id (equal to its key) and a name.`);
    if (!Array.isArray(raw.interfaces) || raw.interfaces.length > 16) return fail(`${raw.name}: interfaces are missing or too many.`);
    const interfaces: Interface[] = [];
    for (const i of raw.interfaces) {
      const parsed = parseInterface(i, String(raw.name));
      if (typeof parsed === 'string') return fail(parsed);
      if (interfaces.some((x) => x.id === parsed.id)) return fail(`${raw.name}: interface ${parsed.id} appears twice.`);
      interfaces.push(parsed);
    }
    const base = { id, name: raw.name.slice(0, 40), interfaces };

    if (raw.kind === 'host') {
      const apps: App[] = [];
      for (const a of Array.isArray(raw.apps) ? raw.apps : []) {
        if (!isObj(a) || !isStr(a.name) || !isPort(a.port)) return fail(`${raw.name}: an application needs a name and a port (1–65535).`);
        apps.push({ name: a.name, port: a.port, ...(isStr(a.reply) ? { reply: a.reply } : {}) });
      }
      if (raw.gateway !== undefined && (!isStr(raw.gateway) || !isValidIp(raw.gateway))) {
        return fail(`${raw.name}: the gateway is not a valid IP address.`);
      }
      if (interfaces.length < 1) return fail(`${raw.name}: a computer needs a network interface.`);
      if (raw.dnsServer !== undefined && (!isStr(raw.dnsServer) || !isValidIp(raw.dnsServer))) {
        return fail(`${raw.name}: the DNS server is not a valid IP address.`);
      }
      let dnsRecords: DnsRecord[] | undefined;
      if (raw.dnsRecords !== undefined) {
        if (!Array.isArray(raw.dnsRecords) || raw.dnsRecords.length > 50) return fail(`${raw.name}: the list of names is invalid.`);
        dnsRecords = [];
        for (const r of raw.dnsRecords) {
          if (!isObj(r) || !isStr(r.name) || r.name.length > 80 || !isStr(r.ip) || !isValidIp(r.ip)) {
            return fail(`${raw.name}: a name needs a text and a valid IP address.`);
          }
          dnsRecords.push({ name: r.name, ip: r.ip });
        }
      }
      let dhcpServer: DhcpServer | undefined;
      if (raw.dhcpServer !== undefined) {
        const c = raw.dhcpServer;
        const okIp = (v: unknown) => isStr(v) && isValidIp(v);
        if (!isObj(c) || !okIp(c.first) || !okIp(c.last) || !Number.isInteger(c.prefix) || (c.prefix as number) < 0 || (c.prefix as number) > 32) {
          return fail(`${raw.name}: the DHCP settings need a first and last address and a prefix.`);
        }
        if ((c.gateway !== undefined && !okIp(c.gateway)) || (c.dns !== undefined && !okIp(c.dns))) {
          return fail(`${raw.name}: the DHCP gateway or DNS address is invalid.`);
        }
        dhcpServer = {
          first: c.first as string,
          last: c.last as string,
          prefix: c.prefix as number,
          ...(isStr(c.gateway) ? { gateway: c.gateway } : {}),
          ...(isStr(c.dns) ? { dns: c.dns } : {}),
          leases: [],
        };
      }
      devices[id] = {
        kind: 'host',
        ...base,
        apps,
        ...(isStr(raw.gateway) ? { gateway: raw.gateway } : {}),
        ...(isStr(raw.dnsServer) ? { dnsServer: raw.dnsServer } : {}),
        ...(dnsRecords ? { dnsRecords } : {}),
        ...(dhcpServer ? { dhcpServer } : {}),
      };
    } else if (raw.kind === 'switch') {
      devices[id] = { kind: 'switch', ...base, macTable: [] };
    } else if (raw.kind === 'router') {
      const routes = [];
      for (const r of Array.isArray(raw.routes) ? raw.routes : []) {
        if (!isObj(r) || !isStr(r.network) || !isValidIp(r.network) || !Number.isInteger(r.prefix) || (r.prefix as number) < 0 || (r.prefix as number) > 32) {
          return fail(`${raw.name}: a route needs a network and a prefix.`);
        }
        if (r.via !== undefined && (!isStr(r.via) || !isValidIp(r.via))) return fail(`${raw.name}: a route has an invalid next hop.`);
        routes.push({ network: r.network, prefix: r.prefix as number, ...(isStr(r.via) ? { via: r.via } : {}) });
      }
      let nat;
      if (raw.nat !== undefined) {
        const n = raw.nat;
        if (!isObj(n) || !isStr(n.outside) || !interfaces.some((i) => i.id === n.outside)) {
          return fail(`${raw.name}: NAT must name one of the router's interfaces as the outside.`);
        }
        const forwards = [];
        for (const f of Array.isArray(n.forwards) ? n.forwards : []) {
          if (!isObj(f) || !isPort(f.outsidePort) || !isPort(f.insidePort) || !isStr(f.insideIp) || !isValidIp(f.insideIp)) {
            return fail(`${raw.name}: a port forwarding rule needs two ports and an inside IP address.`);
          }
          forwards.push({ outsidePort: f.outsidePort, insideIp: f.insideIp, insidePort: f.insidePort });
        }
        nat = { outside: n.outside, forwards, table: [] };
      }
      devices[id] = { kind: 'router', ...base, routes, ...(nat ? { nat } : {}) };
    } else {
      return fail(`${raw.name}: unknown kind of device.`);
    }
  }

  const used = new Set<string>();
  const links: Topology['links'] = [];
  for (const l of data.links) {
    const ends = isObj(l) ? [l.a, l.b] : [];
    const parsed = ends.map((e) => (isObj(e) && isStr(e.device) && isStr(e.iface) ? { device: e.device, iface: e.iface } : null));
    if (parsed.length !== 2 || !parsed[0] || !parsed[1]) return fail('A cable is missing one of its ends.');
    for (const e of parsed) {
      if (!devices[e!.device]?.interfaces.some((i) => i.id === e!.iface)) return fail(`A cable goes to ${e!.device}.${e!.iface}, which does not exist.`);
      const key = `${e!.device}.${e!.iface}`;
      if (used.has(key)) return fail(`${key} has two cables.`);
      used.add(key);
    }
    links.push({ a: parsed[0], b: parsed[1] });
  }

  const positions: Positions = {};
  const given = isObj(data.positions) ? data.positions : {};
  for (const id of Object.keys(devices)) {
    const p = given[id];
    if (isObj(p) && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      positions[id] = { x: Math.min(1110, Math.max(90, p.x as number)), y: Math.min(590, Math.max(50, p.y as number)) };
    } else {
      positions[id] = freeSpot(positions);
    }
  }
  return { ok: true, scene: { topology: { devices, links }, positions } };
}

// ---- URL hash ----

const HASH_KEY = 's=';

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** The fragment (without '#') that carries a whole network. */
export function encodeHash(scene: Scene): string {
  // Compact: no whitespace.
  return HASH_KEY + toBase64Url(JSON.stringify(JSON.parse(exportScene(scene))));
}

/** Read a network from a location hash; null if there is none, an error result if it is damaged. */
export function decodeHash(hash: string): ParseResult | null {
  const h = hash.replace(/^#/, '');
  if (!h.startsWith(HASH_KEY)) return null;
  try {
    return parseScene(fromBase64Url(h.slice(HASH_KEY.length)));
  } catch {
    return fail('The link is damaged.');
  }
}

/** A short link such as `#nat-demo` names an example file or a built-in scenario. Returns the name, or null. */
export function shortName(hash: string): string | null {
  const h = hash.replace(/^#\/?/, '');
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,60}$/.test(h) && !h.startsWith(HASH_KEY) ? h : null;
}
