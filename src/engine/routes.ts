import { networkLabel } from './addressing';
import type { Router } from './model';

/** One line of a router's routing table, for display. `key` matches the row id in lookup events. */
export interface RouteRow {
  key: string;
  /** Destination network, e.g. "192.168.2.0/24". */
  network: string;
  /** Where to send: "directly connected" or the next-hop router. */
  via: string | null;
  /** Interface the packet leaves through (known for connected networks). */
  iface: string | null;
  connected: boolean;
}

export const connectedKey = (iface: string) => `connected:${iface}`;
export const staticKey = (network: string, prefix: number) => `route:${network}/${prefix}`;

/** The routing table as a student sees it: connected networks first, then static routes. */
export function routeRows(router: Router): RouteRow[] {
  const rows: RouteRow[] = [];
  for (const i of router.interfaces) {
    if (i.ip && i.prefix !== undefined) {
      rows.push({
        key: connectedKey(i.id),
        network: networkLabel(i.ip, i.prefix),
        via: null,
        iface: i.id,
        connected: true,
      });
    }
  }
  for (const r of router.routes) {
    rows.push({
      key: staticKey(r.network, r.prefix),
      network: `${r.network}/${r.prefix}`,
      via: r.via ?? null,
      iface: null,
      connected: false,
    });
  }
  return rows;
}

export const natKey = (outsidePort: number) => `nat:${outsidePort}`;
export const forwardKey = (outsidePort: number) => `fwd:${outsidePort}`;
