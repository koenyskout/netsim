import type { SimEvent } from '../engine/events';
import type { Layer, Packet } from '../engine/model';

/** A packet instance as it appears on screen at a given moment. */
export interface Token {
  pid: number;
  /** Device the token is at (for a transmit: the device it has just arrived at). */
  device: string;
  /** If the token's very first event is a transmit: where it starts from. */
  spawnFrom?: string;
  packet: Packet;
  status: 'live' | 'delivered' | 'dropped';
  /** True when the current event is about this token. */
  current: boolean;
  /** Layer being opened (peeled) by the current event. */
  opening?: Layer;
}

export interface Scene {
  tokens: Token[];
  /** The token the inspector shows: the one the current event is about. */
  focus: Token | null;
  event: SimEvent | null;
  /** Layer the current event works at (for highlighting in device layer stacks). */
  activeLayer: Layer | null;
  /** The cable used by the current transmit event. */
  litLink: { from: string; fromIface: string; to: string; toIface: string } | null;
}

const EVENT_LAYER: Record<string, Layer | undefined> = {
  create: 'application',
  deliver: 'application',
  learn: 'link',
  flood: 'link',
  rewrite: 'link',
  nat: 'transport',
  configure: 'network',
  transmit: 'link',
};

export function layerOfEvent(e: SimEvent): Layer | null {
  if (e.kind === 'add-layer' || e.kind === 'open-layer') return e.layer;
  if (e.kind === 'lookup') {
    return { arp: 'network', route: 'network', mac: 'link', socket: 'transport', nat: 'transport', dns: 'application', dhcp: 'application' }[e.table] as Layer;
  }
  return EVENT_LAYER[e.kind] ?? null;
}

/** Everything that is visible on the stage after `position` events have been shown. */
export function sceneAt(events: readonly SimEvent[], position: number): Scene {
  const current = position > 0 ? events[position - 1] : null;
  const byPid = new Map<number, Token & { ended: boolean; significantDrop: boolean }>();

  for (let i = 0; i < position; i++) {
    const e = events[i];
    let t = byPid.get(e.pid);
    if (!t) {
      t = {
        pid: e.pid,
        device: e.device,
        spawnFrom: e.kind === 'transmit' ? e.device : undefined,
        packet: { headers: [], message: '' },
        status: 'live',
        current: false,
        ended: false,
        significantDrop: false,
      };
      byPid.set(e.pid, t);
    }
    if ('packet' in e) t.packet = e.packet;
    t.device = e.kind === 'transmit' ? e.to.device : e.device;
    if (e.kind === 'transmit' && e.copyOf !== undefined) {
      const original = byPid.get(e.copyOf);
      if (original) original.ended = true;
    }
    if (e.kind === 'deliver') t.status = 'delivered';
    if (e.kind === 'drop') {
      t.status = 'dropped';
      t.significantDrop = e.significant;
    }
  }

  const tokens: Token[] = [];
  for (const t of byPid.values()) {
    const isCurrent = current !== null && current.pid === t.pid;
    if (t.ended && !isCurrent) continue;
    // Finished packets only linger while they are the subject, except real failures.
    if (t.status === 'delivered' && !isCurrent) continue;
    if (t.status === 'dropped' && !t.significantDrop && !isCurrent) continue;
    tokens.push({
      pid: t.pid,
      device: t.device,
      spawnFrom: t.spawnFrom,
      packet: t.packet,
      status: t.status,
      current: isCurrent,
      opening: isCurrent && current?.kind === 'open-layer' ? current.layer : undefined,
    });
  }

  const focusFull = current ? byPid.get(current.pid) : undefined;
  const focus = focusFull
    ? {
        pid: focusFull.pid,
        device: focusFull.device,
        spawnFrom: focusFull.spawnFrom,
        packet: focusFull.packet,
        status: focusFull.status,
        current: true,
        opening: current?.kind === 'open-layer' ? current.layer : undefined,
      }
    : null;

  return {
    tokens,
    focus,
    event: current,
    activeLayer: current ? layerOfEvent(current) : null,
    litLink:
      current?.kind === 'transmit'
        ? { from: current.device, fromIface: current.iface, to: current.to.device, toIface: current.to.iface }
        : null,
  };
}
