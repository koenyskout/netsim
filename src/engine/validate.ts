import { isValidIp, networkLabel, sameNetwork } from './addressing';
import { hasAddresses, type Topology } from './model';

/** A friendly hint about a configuration. Never blocks anything: broken networks are allowed. */
export interface Warning {
  text: string;
}

const w = (text: string): Warning => ({ text });

/** Everything that looks wrong about one device's configuration. */
export function warningsFor(topo: Topology, deviceId: string): Warning[] {
  const device = topo.devices[deviceId];
  if (!device || !hasAddresses(device)) return [];
  const out: Warning[] = [];

  for (const iface of device.interfaces) {
    const label = device.kind === 'router' ? `${iface.id}: ` : '';
    if (!iface.ip) {
      out.push(w(`${label}No IP address, so this interface cannot be used.`));
      continue;
    }
    if (iface.prefix === undefined) {
      out.push(w(`${label}No subnet mask. The mask says which addresses are on the same network.`));
    }
    for (const other of Object.values(topo.devices)) {
      for (const o of other.interfaces) {
        if ((other.id !== device.id || o.id !== iface.id) && o.ip === iface.ip && hasAddresses(other)) {
          out.push(w(`${label}${iface.ip} is also used by ${other.name}. Two devices with one address will confuse the network.`));
        }
      }
    }
  }

  if (device.kind === 'host') {
    const iface = device.interfaces[0];
    if (device.gateway === undefined) {
      const hasRouter = Object.values(topo.devices).some((d) => d.kind === 'router');
      if (iface.ip && hasRouter) out.push(w('No default gateway: this computer can only talk to its own network.'));
    } else if (!isValidIp(device.gateway)) {
      out.push(w('The default gateway is not a valid IP address.'));
    } else if (iface.ip && iface.prefix !== undefined && !sameNetwork(iface.ip, device.gateway, iface.prefix)) {
      out.push(
        w(
          `The default gateway ${device.gateway} is not on this computer's own network (${networkLabel(iface.ip, iface.prefix)}), so it cannot be reached.`,
        ),
      );
    } else if (device.gateway === iface.ip) {
      out.push(w('The default gateway is this computer itself.'));
    }
    if (device.dnsServer !== undefined && !isValidIp(device.dnsServer)) {
      out.push(w('The DNS server is not a valid IP address.'));
    }
    if (device.dhcpServer && !iface.ip) {
      out.push(w('A DHCP server needs an address of its own, so that the others can reach it.'));
    }
    const ports = new Set<number>();
    for (const app of device.apps) {
      if (ports.has(app.port)) out.push(w(`Port ${app.port} is opened by two applications. Only one can use it.`));
      ports.add(app.port);
    }
  }

  if (device.kind === 'router') {
    const nets = new Map<string, string>();
    for (const iface of device.interfaces) {
      if (!iface.ip || iface.prefix === undefined) continue;
      const net = networkLabel(iface.ip, iface.prefix);
      const prev = nets.get(net);
      if (prev) out.push(w(`${prev} and ${iface.id} are both on ${net}. A router connects different networks.`));
      nets.set(net, iface.id);
    }
    for (const r of device.routes) {
      if (!r.via) continue;
      const reachable = device.interfaces.some(
        (i) => i.ip && i.prefix !== undefined && sameNetwork(i.ip, r.via!, i.prefix),
      );
      if (!reachable) {
        out.push(w(`Route to ${r.network}/${r.prefix}: the next hop ${r.via} is not on any network this router is connected to.`));
      }
    }
  }
  if (device.kind === 'router' && device.nat) {
    const nat = device.nat;
    const outside = device.interfaces.find((i) => i.id === nat.outside);
    if (!outside?.ip) {
      out.push(w(`NAT is on, but the outside interface ${nat.outside} has no IP address: there is no public address to share.`));
    }
    const seen = new Set<number>();
    for (const f of nat.forwards) {
      if (seen.has(f.outsidePort)) out.push(w(`Public port ${f.outsidePort} is forwarded twice. Only one rule can use it.`));
      seen.add(f.outsidePort);
      const behind = device.interfaces.some(
        (i) => i.id !== nat.outside && i.ip && i.prefix !== undefined && sameNetwork(i.ip, f.insideIp, i.prefix),
      );
      if (!isValidIp(f.insideIp)) out.push(w(`Forwarding rule for port ${f.outsidePort}: ${f.insideIp} is not a valid IP address.`));
      else if (!behind) out.push(w(`Forwarding rule for port ${f.outsidePort}: ${f.insideIp} is not on a network behind this router.`));
    }
  }
  return out;
}
