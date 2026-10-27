import type { SimResult } from '../engine/events';
import { addDevice, connectDevices, freeSpot, removeDevice, removeLink, type NewKind, type Positions } from '../engine/edit';
import { hasAddresses, type Action, type ArpEntry, type Device, type MacEntry, type NatEntry, type Topology } from '../engine/model';
import type { Scene } from '../engine/share';
import { simulate } from '../engine/simulate';
import { Timeline } from '../engine/timeline';
import type { Preset } from '../presets/types';
import { sceneAt } from './scene';

/** Reactive state for the whole app: current preset, the last run, and the step cursor. */
export class Player {
  preset = $state.raw<Preset>(undefined as unknown as Preset);
  /** The topology between runs (switches keep what they have learned). */
  topology = $state.raw<Topology>(undefined as unknown as Topology);
  result = $state.raw<SimResult | null>(null);
  position = $state(0);
  /** Device whose configuration is shown in the side panel. */
  selected = $state<string | null>(null);
  /** Which side panel tab is open. */
  tab = $state<'packet' | 'device' | 'layers'>('packet');
  /** Whether configuration hints are shown (troubleshooting scenarios hide them at first). */
  showHints = $state(true);
  /** Where each device sits on the stage; starts from the preset and follows drags. */
  positions = $state.raw<Positions>({});
  /** Edit mode: drag devices, add and remove devices and cables. */
  editMode = $state(false);
  /** Cable tool: the first device clicked, waiting for the second. */
  cableFrom = $state<string | null>(null);
  cableTool = $state(false);
  /** Last problem with an edit, shown near the toolbar. */
  editMessage = $state('');
  /** Bumped when the topology is replaced wholesale, so edit forms can start over. */
  epoch = $state(0);
  /** Show ARP questions and answers, or let devices just know the next hop's MAC address. */
  showArp = $state(loadShowArp());
  /** What the current run started from, so it can be run again with ARP shown or hidden. */
  private runFrom: { topology: Topology; action: Action } | null = null;

  events = $derived(this.result?.events ?? []);
  scene = $derived(sceneAt(this.events, this.position));
  atStart = $derived(this.position === 0);
  atEnd = $derived(this.position >= this.events.length);

  macTables = $derived.by((): Record<string, MacEntry[]> => {
    if (!this.result) {
      const tables: Record<string, MacEntry[]> = {};
      for (const d of Object.values(this.topology.devices)) {
        if (d.kind === 'switch') tables[d.id] = d.macTable;
      }
      return tables;
    }
    const t = new Timeline(this.result);
    t.seek(this.position);
    return t.macTables();
  });

  natTables = $derived.by((): Record<string, NatEntry[]> => {
    if (!this.result) {
      const tables: Record<string, NatEntry[]> = {};
      for (const d of Object.values(this.topology.devices)) {
        if (d.kind === 'router' && d.nat) tables[d.id] = d.nat.table;
      }
      return tables;
    }
    const t = new Timeline(this.result);
    t.seek(this.position);
    return t.natTables();
  });

  arpTables = $derived.by((): Record<string, ArpEntry[]> => {
    if (!this.result) {
      const tables: Record<string, ArpEntry[]> = {};
      for (const d of Object.values(this.topology.devices)) {
        if (hasAddresses(d)) tables[d.id] = d.arpTable ?? [];
      }
      return tables;
    }
    const t = new Timeline(this.result);
    t.seek(this.position);
    return t.arpTables();
  });

  constructor(preset: Preset) {
    this.loadPreset(preset);
  }

  loadPreset(preset: Preset): void {
    this.preset = preset;
    this.topology = structuredClone(preset.topology);
    this.result = null;
    this.position = 0;
    this.selected = null;
    this.tab = 'packet';
    this.showHints = !preset.hideHints;
    this.positions = structuredClone(preset.positions);
    this.cableFrom = null;
    this.editMessage = '';
    this.epoch++;
  }

  /** Start the student's own network, e.g. from an imported file or a shared link. */
  loadScene(scene: Scene, title = 'Your network'): void {
    this.loadPreset({
      id: 'sandbox',
      group: 'sandbox',
      title,
      description: 'Your own network. Use Edit to add devices and cables, click a device to configure it.',
      goal: 'Build something, give every device an address, and send a message to see where it goes.',
      topology: scene.topology,
      positions: scene.positions,
      suggestions: [],
    });
  }

  /** Turn whatever is on screen into the student's own network (so Reset no longer undoes edits). */
  private adopt(): void {
    if (this.preset.group === 'sandbox') return;
    const hasDevice = (id: string) => id in this.topology.devices;
    this.preset = {
      ...this.preset,
      id: 'sandbox',
      group: 'sandbox',
      title: `Your network (from ${this.preset.title})`,
      suggestions: this.preset.suggestions.filter((s) => hasDevice(s.action.from)),
      hideHints: false,
    };
  }

  /** Change the shape of the network. Clears the run. */
  private restructure(change: (topology: Topology, positions: Positions) => void): void {
    this.adopt();
    const topology = structuredClone(this.topology);
    const positions = structuredClone(this.positions) as Positions;
    change(topology, positions);
    this.topology = topology;
    this.positions = positions;
    this.result = null;
    this.position = 0;
    this.syncBaseline();
  }

  /** In the sandbox, the baseline is what is on screen, so Reset only forgets learned state. */
  private syncBaseline(): void {
    if (this.preset.group !== 'sandbox') return;
    const topology = structuredClone(this.topology);
    for (const d of Object.values(topology.devices)) {
      if (d.kind === 'switch') d.macTable = [];
      if (hasAddresses(d)) delete d.arpTable;
      if (d.kind === 'router' && d.nat) d.nat.table = [];
      if (d.kind === 'host' && d.dhcpServer) d.dhcpServer.leases = [];
    }
    this.preset = {
      ...this.preset,
      topology,
      positions: structuredClone(this.positions) as Positions,
      suggestions: this.preset.suggestions.filter((s) => s.action.from in topology.devices),
    };
  }

  add(kind: NewKind): void {
    let id = '';
    this.restructure((t, p) => {
      id = addDevice(t, kind);
      p[id] = freeSpot(p);
    });
    this.selected = id;
    this.tab = 'device';
    this.editMessage = '';
  }

  remove(id: string): void {
    this.restructure((t, p) => {
      removeDevice(t, id);
      delete p[id];
    });
    if (this.selected === id) this.select(null);
    this.cableFrom = null;
  }

  removeCable(index: number): void {
    this.restructure((t) => removeLink(t, index));
  }

  /** Cable tool click: first click picks a device, second click connects. */
  cableClick(id: string): void {
    if (this.cableFrom === null || this.cableFrom === id) {
      this.cableFrom = this.cableFrom === id ? null : id;
      this.editMessage = '';
      return;
    }
    const from = this.cableFrom;
    let error: string | null = null;
    // Validate on a copy first, so a refused cable does not clear the run.
    error = connectDevices(structuredClone(this.topology), from, id);
    if (error) {
      this.editMessage = error;
      this.cableFrom = null;
      return;
    }
    this.restructure((t) => void connectDevices(t, from, id));
    this.cableFrom = null;
    this.editMessage = '';
  }

  moveDevice(id: string, x: number, y: number): void {
    this.positions = { ...this.positions, [id]: { x, y } };
    this.syncBaseline();
  }

  setEditMode(on: boolean): void {
    this.editMode = on;
    this.cableTool = false;
    this.cableFrom = null;
    this.editMessage = '';
  }

  /** Current network as a scene, for export and sharing. */
  design(): Scene {
    return { topology: this.topology, positions: this.positions };
  }

  select(id: string | null): void {
    this.selected = id;
    this.tab = id ? 'device' : 'packet';
  }

  /** Change one device's configuration. Clears the current run, since it no longer applies. */
  edit(id: string, change: (device: Device) => void): void {
    const topology = structuredClone(this.topology);
    change(topology.devices[id]);
    this.topology = topology;
    this.result = null;
    this.position = 0;
    this.syncBaseline();
  }

  /** Forget everything the switches learned and clear the run. */
  reset(): void {
    this.loadPreset(this.preset);
  }

  send(action: Action): void {
    this.runFrom = { topology: this.topology, action };
    const result = simulate(this.topology, action, { arp: this.showArp });
    this.result = result;
    this.topology = result.topology;
    this.position = 0;
    if (this.tab !== 'layers') this.tab = 'packet';
  }

  /** Switch ARP on or off; the current run starts over with the new setting. */
  setShowArp(on: boolean): void {
    this.showArp = on;
    saveShowArp(on);
    if (this.result && this.runFrom) {
      this.topology = this.runFrom.topology;
      this.send(this.runFrom.action);
    }
  }

  private timeline(): Timeline | null {
    if (!this.result) return null;
    const t = new Timeline(this.result);
    t.seek(this.position);
    return t;
  }

  next(): void {
    this.position = Math.min(this.events.length, this.position + 1);
  }
  prev(): void {
    this.position = Math.max(0, this.position - 1);
  }
  nextHop(): void {
    const t = this.timeline();
    if (t) {
      t.nextHop();
      this.position = t.position;
    }
  }
  prevHop(): void {
    const t = this.timeline();
    if (t) {
      t.prevHop();
      this.position = t.position;
    }
  }
  seek(position: number): void {
    this.position = Math.max(0, Math.min(this.events.length, Math.trunc(position)));
  }
  restart(): void {
    this.position = 0;
  }
}

// Remembered per viewer; storage may be unavailable (private windows, blocked site data).
const ARP_KEY = 'netsim.showArp';

function loadShowArp(): boolean {
  try {
    return globalThis.localStorage?.getItem(ARP_KEY) !== 'false';
  } catch {
    return true;
  }
}

function saveShowArp(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(ARP_KEY, String(on));
  } catch {
    // Not remembered; it still applies for now.
  }
}
