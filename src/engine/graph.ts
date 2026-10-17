import type { Device, Endpoint, Interface, Topology } from './model';

export function peerOf(topo: Topology, device: string, iface: string): Endpoint | null {
  for (const link of topo.links) {
    if (link.a.device === device && link.a.iface === iface) return link.b;
    if (link.b.device === device && link.b.iface === iface) return link.a;
  }
  return null;
}

export function getInterface(device: Device, iface: string): Interface {
  const found = device.interfaces.find((i) => i.id === iface);
  if (!found) throw new Error(`Device ${device.id} has no interface ${iface}`);
  return found;
}

/**
 * Find the MAC address of the interface that owns `ip` on the same local
 * network (link-layer segment) as the given interface. Switches pass
 * everything through, routers and hosts end the segment. This stands in for
 * ARP, which the simulator hides by default.
 */
export function resolveMac(
  topo: Topology,
  fromDevice: string,
  fromIface: string,
  ip: string,
): string | null {
  const start = peerOf(topo, fromDevice, fromIface);
  if (!start) return null;
  const seen = new Set<string>([`${fromDevice}|${fromIface}`]);
  const queue: Endpoint[] = [start];
  while (queue.length > 0) {
    const ep = queue.shift()!;
    const key = `${ep.device}|${ep.iface}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const device = topo.devices[ep.device];
    if (device.kind === 'switch') {
      for (const port of device.interfaces) {
        if (port.id === ep.iface) continue;
        const next = peerOf(topo, device.id, port.id);
        if (next) queue.push(next);
      }
    } else {
      const iface = getInterface(device, ep.iface);
      if (iface.ip === ip) return iface.mac;
    }
  }
  return null;
}
