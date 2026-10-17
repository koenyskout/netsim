import type { DropReason, Layer, MacEntry, NatEntry, Packet } from './model';

/**
 * The simulation produces a flat list of events. The UI replays them; going
 * backward is just moving a cursor. Every event carries a plain-language caption.
 */
interface Base {
  /** Device where this happens (for 'transmit': the sending device). */
  device: string;
  caption: string;
  /** Identifies one packet instance; a flooding switch makes new copies with new ids. */
  pid: number;
}

export type NatField = 'srcIp' | 'srcPort' | 'dstIp' | 'dstPort';

export type SimEvent =
  | (Base & { kind: 'create'; app: string; packet: Packet })
  | (Base & { kind: 'add-layer'; layer: Layer; packet: Packet })
  | (Base & { kind: 'open-layer'; layer: Layer; packet: Packet })
  | (Base & {
      kind: 'lookup';
      table: 'arp' | 'route' | 'mac' | 'socket' | 'nat' | 'dns' | 'dhcp';
      key: string;
      result: string | null;
      /** Identifies the matching table row (for highlighting). */
      row: string | null;
      packet: Packet;
    })
  | (Base & { kind: 'learn'; mac: string; port: string; macTable: MacEntry[] })
  | (Base & {
      kind: 'rewrite';
      layer: Layer;
      field: 'srcMac' | 'dstMac';
      from: string;
      to: string;
      packet: Packet;
    })
  | (Base & {
      kind: 'nat';
      direction: 'out' | 'in';
      /** What was replaced, in order. */
      changes: { field: NatField; from: string | number; to: string | number }[];
      /** Table row used: 'nat:<port>' or 'fwd:<port>'. */
      row: string;
      /** True when the router just made up a new table entry. */
      created: boolean;
      packet: Packet;
      natTable: NatEntry[];
    })
  | (Base & {
      kind: 'configure';
      iface: string;
      ip: string;
      prefix: number;
      gateway?: string;
      dns?: string;
      packet: Packet;
    })
  | (Base & { kind: 'flood'; ports: string[]; packet: Packet })
  | (Base & {
      kind: 'transmit';
      iface: string;
      to: { device: string; iface: string };
      packet: Packet;
      /** Set when this is a copy made by a flooding switch: the pid of the original. */
      copyOf?: number;
    })
  | (Base & { kind: 'deliver'; app: string; port: number; packet: Packet })
  | (Base & {
      kind: 'drop';
      reason: DropReason;
      /** False for normal behaviour such as ignoring a flooded frame meant for someone else. */
      significant: boolean;
      packet: Packet;
    });

export interface Outcome {
  /** The original message reached an application. */
  delivered: boolean;
  /** Why it did not arrive, and where. */
  reason?: DropReason;
  device?: string;
  /** Only set when the receiving app sends a reply. */
  replyDelivered?: boolean;
  replyReason?: DropReason;
  replyDevice?: string;
  /** Replaces the standard success text (used when the 'message' is a helper protocol such as DHCP). */
  note?: string;
}

export interface SimResult {
  events: SimEvent[];
  /** Topology after the run (switches have learned MAC addresses). */
  topology: import('./model').Topology;
  /** MAC tables before the run, so the UI can show them at step 0. */
  initialMacTables: Record<string, MacEntry[]>;
  /** NAT tables before the run. */
  initialNatTables: Record<string, NatEntry[]>;
  outcome: Outcome;
}
