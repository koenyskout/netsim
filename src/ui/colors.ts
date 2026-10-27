import type { Layer } from '../engine/model';

export interface LayerMeta {
  name: string;
  /** What this layer is for, in a few words. */
  purpose: string;
  /** CSS custom property holding the layer colour. */
  color: string;
}

export const LAYER_META: Record<Layer, LayerMeta> = {
  application: { name: 'Application', purpose: 'the message', color: 'var(--c-app)' },
  transport: { name: 'Transport', purpose: 'which application (port)', color: 'var(--c-transport)' },
  network: { name: 'Network', purpose: 'which computer, anywhere (IP)', color: 'var(--c-network)' },
  link: { name: 'Link', purpose: 'next device on this network (MAC)', color: 'var(--c-link)' },
};

/** An ARP message sits where the application message would be. */
export const ARP_META: LayerMeta = { name: 'ARP', purpose: 'which MAC belongs to this IP?', color: 'var(--c-arp)' };

/** Which layers each kind of device works at. */
export const DEVICE_LAYERS: Record<'host' | 'switch' | 'router', readonly Layer[]> = {
  host: ['application', 'transport', 'network', 'link'],
  router: ['network', 'link'],
  switch: ['link'],
};

/** Stable hue (0-359) for an address, so the same address always has the same colour. */
export function hueOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 360) | 0;
}

/** The last two bytes of a MAC address, e.g. 02:00:00:00:00:0A -> 00:0A. */
export function shortMac(mac: string): string {
  return mac.split(':').slice(-2).join(':');
}

/** A router that does NAT also works with the ports, so it works at the transport layer too. */
export function layersOf(device: import('../engine/model').Device): readonly Layer[] {
  if (device.kind === 'router' && device.nat) return ['transport', 'network', 'link'];
  return DEVICE_LAYERS[device.kind];
}
