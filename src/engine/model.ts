/** The four layers, from top to bottom. */
export type Layer = 'application' | 'transport' | 'network' | 'link';
export const LAYERS: readonly Layer[] = ['application', 'transport', 'network', 'link'];

export const BROADCAST_MAC = 'FF:FF:FF:FF:FF:FF';

// ---- Packets: a message wrapped in headers, outermost header first ----

export interface LinkHeader {
  layer: 'link';
  srcMac: string;
  dstMac: string;
}
export interface NetworkHeader {
  layer: 'network';
  srcIp: string;
  dstIp: string;
}
export interface TransportHeader {
  layer: 'transport';
  srcPort: number;
  dstPort: number;
}
export type Header = LinkHeader | NetworkHeader | TransportHeader;

export interface Packet {
  /** Outermost header first (link, then network, then transport). */
  headers: Header[];
  /** The application-layer message. */
  message: string;
  isReply?: boolean;
  /** Set on packets that belong to a helper protocol, so the outcome only judges the real message. */
  service?: 'dns' | 'dhcp' | 'arp';
  /** What the helper protocol carries (the name asked for, the address handed out, ...). */
  data?: Record<string, string>;
  /** The contents of an ARP question or answer (an ARP packet has a link header and nothing else). */
  arp?: ArpMessage;
}

/** "Who has <targetIp>? Tell <senderIp>", or the answer "<senderIp> is at <senderMac>". */
export interface ArpMessage {
  op: 'request' | 'reply';
  senderIp: string;
  senderMac: string;
  targetIp: string;
}

/** One remembered answer: this IP address belongs to this MAC address. */
export interface ArpEntry {
  ip: string;
  mac: string;
}

export const LIMITED_BROADCAST = '255.255.255.255';

// ---- Devices ----

export interface Interface {
  id: string;
  mac: string;
  ip?: string;
  /** Prefix length (24 = 255.255.255.0). */
  prefix?: number;
}

/** An application on a host that has opened a port. */
export interface App {
  name: string;
  port: number;
  /** If set, the app answers every message with this text. */
  reply?: string;
}

export interface DnsRecord {
  name: string;
  ip: string;
}

/** An address handed out by a DHCP server; remembered between runs like a MAC table. */
export interface Lease {
  mac: string;
  ip: string;
}

export interface DhcpServer {
  /** The pool: first and last address it may hand out. */
  first: string;
  last: string;
  prefix: number;
  gateway?: string;
  dns?: string;
  leases: Lease[];
}

export interface Host {
  kind: 'host';
  id: string;
  name: string;
  interfaces: Interface[];
  gateway?: string;
  apps: App[];
  /** Address of the DNS server this computer asks for names. */
  dnsServer?: string;
  /** Present when this computer is a DNS server (it listens on port 53). */
  dnsRecords?: DnsRecord[];
  /** Present when this computer is a DHCP server (it listens on port 67). */
  dhcpServer?: DhcpServer;
  /** Learned by ARP; survives between runs like a switch's MAC table. */
  arpTable?: ArpEntry[];
}

export interface MacEntry {
  mac: string;
  port: string;
}

export interface Switch {
  kind: 'switch';
  id: string;
  name: string;
  /** Switch ports; they have no addresses of their own. */
  interfaces: Interface[];
  macTable: MacEntry[];
}

export interface Route {
  network: string;
  prefix: number;
  /** Next-hop router. If omitted the network must be directly connected. */
  via?: string;
}

/** One remembered connection: an inside address and port, and the public port standing in for it. */
export interface NatEntry {
  insideIp: string;
  insidePort: number;
  outsidePort: number;
}

/** A standing rule: whatever arrives at this public port goes to this inside application. */
export interface PortForward {
  outsidePort: number;
  insideIp: string;
  insidePort: number;
}

export interface NatConfig {
  /** Interface facing the internet; its IP address is the one shared by everybody inside. */
  outside: string;
  forwards: PortForward[];
  /** Connections remembered from the inside; survives between runs like a switch's MAC table. */
  table: NatEntry[];
}

export interface Router {
  kind: 'router';
  id: string;
  name: string;
  interfaces: Interface[];
  routes: Route[];
  /** Present when the router does network address translation. */
  nat?: NatConfig;
  /** Learned by ARP; survives between runs like a switch's MAC table. */
  arpTable?: ArpEntry[];
}

export type Device = Host | Switch | Router;

export interface Endpoint {
  device: string;
  iface: string;
}
export interface Link {
  a: Endpoint;
  b: Endpoint;
}

export interface Topology {
  devices: Record<string, Device>;
  links: Link[];
}

// ---- Actions and results ----

export interface SendAction {
  type: 'send';
  from: string;
  /** Name of the sending application (shown in captions). */
  app?: string;
  dstIp: string;
  /** If set (and not empty), the sender first asks its DNS server for this name and ignores dstIp. */
  dstName?: string;
  dstPort: number;
  message: string;
  /** Source port; defaults to 49152. */
  srcPort?: number;
}

/** A computer without an address asks the network for one. */
export interface DhcpAction {
  type: 'dhcp';
  from: string;
}

export type Action = SendAction | DhcpAction;

export type DropReason =
  | 'no-ip'
  | 'no-link'
  | 'no-gateway'
  | 'gateway-unreachable'
  | 'no-route'
  | 'no-arp-reply'
  | 'arp-not-me'
  | 'port-closed'
  | 'wrong-ip'
  | 'wrong-mac'
  | 'filtered'
  | 'no-mapping'
  | 'no-dns-server'
  | 'name-not-found'
  | 'broadcast'
  | 'ignored'
  | 'pool-empty'
  | 'loop';

/** Reasons that are normal network behaviour and not a failure of the message. */
export const INSIGNIFICANT_DROPS: readonly DropReason[] = ['wrong-mac', 'filtered', 'broadcast', 'ignored', 'arp-not-me'];

export function header<L extends Header['layer']>(
  packet: Packet,
  layer: L,
): Extract<Header, { layer: L }> | undefined {
  return packet.headers.find((h) => h.layer === layer) as Extract<Header, { layer: L }> | undefined;
}
