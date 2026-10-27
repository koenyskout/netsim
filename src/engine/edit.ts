import type { Device, Interface, Topology } from './model';

/** Pure-ish helpers to change the shape of a network. They mutate the topology they are given. */

export type NewKind = 'host' | 'switch' | 'hub' | 'router';
export type Positions = Record<string, { x: number; y: number }>;

const MAX_INTERFACES: Record<'switch' | 'hub' | 'router', number> = { switch: 8, hub: 8, router: 4 };

const LABEL: Record<NewKind, { id: string; name: string }> = {
  host: { id: 'pc', name: 'PC' },
  switch: { id: 'sw', name: 'Switch' },
  hub: { id: 'hub', name: 'Hub' },
  router: { id: 'r', name: 'Router' },
};

/** The next unused MAC address (locally administered, so it never clashes with real hardware). */
export function nextMac(topo: Topology): string {
  let max = 0;
  for (const d of Object.values(topo.devices)) {
    for (const i of d.interfaces) {
      const parts = i.mac.split(':');
      const n = parseInt(parts.slice(-2).join(''), 16);
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  const n = max + 1;
  const hex = n.toString(16).toUpperCase().padStart(4, '0');
  return `02:00:00:00:${hex.slice(0, 2)}:${hex.slice(2)}`;
}

export function addDevice(topo: Topology, kind: NewKind): string {
  const label = LABEL[kind];
  const names = new Set(Object.values(topo.devices).map((d) => d.name));
  let n = 1;
  while (topo.devices[`${label.id}${n}`] || names.has(`${label.name}${kind === 'host' ? '' : ' '}${n}`)) n++;
  const id = `${label.id}${n}`;
  const name = `${label.name}${kind === 'host' ? '' : ' '}${n}`;
  const iface = (id: string): Interface => ({ id, mac: nextMac(topo) });

  let device: Device;
  if (kind === 'host') {
    device = { kind, id, name, interfaces: [], apps: [] };
    device.interfaces.push(iface('eth0'));
  } else if (kind === 'switch') {
    device = { kind, id, name, interfaces: [], macTable: [] };
    topo.devices[id] = device;
    for (let i = 1; i <= 4; i++) device.interfaces.push(iface(`p${i}`));
  } else if (kind === 'hub') {
    device = { kind, id, name, interfaces: [] };
    topo.devices[id] = device;
    for (let i = 1; i <= 4; i++) device.interfaces.push(iface(`p${i}`));
  } else {
    device = { kind, id, name, interfaces: [], routes: [] };
    topo.devices[id] = device;
    for (let i = 0; i < 2; i++) device.interfaces.push(iface(`eth${i}`));
  }
  topo.devices[id] = device;
  return id;
}

function isUsed(topo: Topology, device: string, iface: string): boolean {
  return topo.links.some(
    (l) => (l.a.device === device && l.a.iface === iface) || (l.b.device === device && l.b.iface === iface),
  );
}

/** First interface without a cable. Switches and routers grow a new one when all are used. */
function takeInterface(topo: Topology, device: Device): Interface | null {
  const free = device.interfaces.find((i) => !isUsed(topo, device.id, i.id));
  if (free) return free;
  if (device.kind === 'host') return null;
  if (device.interfaces.length >= MAX_INTERFACES[device.kind]) return null;
  const n = device.interfaces.length;
  const created: Interface = { id: device.kind === 'router' ? `eth${n}` : `p${n + 1}`, mac: nextMac(topo) };
  device.interfaces.push(created);
  return created;
}

/** Connect two devices with a cable on their first free interfaces. Returns an error message, or null on success. */
export function connectDevices(topo: Topology, aId: string, bId: string): string | null {
  const a = topo.devices[aId];
  const b = topo.devices[bId];
  if (!a || !b) return 'Unknown device.';
  if (a.id === b.id) return 'A cable needs two different devices.';
  const noPort = (d: Device) =>
    d.kind === 'host' ? `${d.name} has only one network port and it is already connected.` : `${d.name} has no free port left.`;
  // Check both before creating anything, so a failure leaves the network untouched.
  const aFree = a.interfaces.some((i) => !isUsed(topo, a.id, i.id)) || (a.kind !== 'host' && a.interfaces.length < MAX_INTERFACES[a.kind]);
  if (!aFree) return noPort(a);
  const bFree = b.interfaces.some((i) => !isUsed(topo, b.id, i.id)) || (b.kind !== 'host' && b.interfaces.length < MAX_INTERFACES[b.kind]);
  if (!bFree) return noPort(b);
  const ia = takeInterface(topo, a)!;
  const ib = takeInterface(topo, b)!;
  topo.links.push({ a: { device: a.id, iface: ia.id }, b: { device: b.id, iface: ib.id } });
  return null;
}

export function removeLink(topo: Topology, index: number): void {
  topo.links.splice(index, 1);
}

export function removeDevice(topo: Topology, id: string): void {
  delete topo.devices[id];
  topo.links = topo.links.filter((l) => l.a.device !== id && l.b.device !== id);
}

/** A spot on the 1200x640 stage that does not overlap another device. */
export function freeSpot(positions: Positions): { x: number; y: number } {
  const taken = Object.values(positions);
  for (let y = 130; y <= 530; y += 200) {
    for (let x = 125; x <= 1075; x += 190) {
      if (taken.every((p) => Math.abs(p.x - x) >= 180 || Math.abs(p.y - y) >= 150)) return { x, y };
    }
  }
  return { x: 600, y: 320 };
}

export const STAGE_MARGIN = { x: 90, y: 50 } as const;
