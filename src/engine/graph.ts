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
