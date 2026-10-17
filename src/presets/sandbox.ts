import { addDevice, connectDevices, freeSpot, type Positions } from '../engine/edit';
import type { Topology } from '../engine/model';
import type { Scene } from '../engine/share';

/** A small starting point for the sandbox: two computers on a switch, left unconfigured. */
export function starterScene(): Scene {
  const topology: Topology = { devices: {}, links: [] };
  const positions: Positions = {};
  const ids = [addDevice(topology, 'host'), addDevice(topology, 'switch'), addDevice(topology, 'host')];
  positions[ids[0]] = { x: 225, y: 330 };
  positions[ids[1]] = { x: 600, y: 330 };
  positions[ids[2]] = { x: 975, y: 330 };
  connectDevices(topology, ids[0], ids[1]);
  connectDevices(topology, ids[2], ids[1]);
  // Keep the helper honest if the grid ever changes.
  for (const id of ids) positions[id] ??= freeSpot(positions);
  return { topology, positions };
}
