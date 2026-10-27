<script lang="ts">
  import type { SimEvent } from '../engine/events';
  import type { Layer } from '../engine/model';
  import { LAYER_META, layersOf } from './colors';
  import { layerOfEvent } from './scene';
  import type { Player } from './player.svelte';

  let { player }: { player: Player } = $props();

  const ORDER: Layer[] = ['application', 'transport', 'network', 'link'];

  function what(e: SimEvent): string {
    switch (e.kind) {
      case 'create': return e.packet.arp ? (e.packet.arp.op === 'request' ? 'asks for a MAC (ARP)' : 'answers with its MAC (ARP)') : 'writes the message';
      case 'add-layer': return 'adds its header';
      case 'open-layer': return 'opens its header';
      case 'lookup': return `looks up ${e.table === 'arp' ? 'the MAC' : e.table === 'mac' ? 'the port' : e.table === 'socket' ? 'the app' : e.table === 'route' ? 'the route' : e.table === 'nat' ? 'the NAT row' : e.table === 'dns' ? 'the name' : 'a free address'}`;
      case 'rewrite': return 'replaces the MAC addresses';
      case 'nat': return 'swaps address and port';
      case 'learn': return 'learns a MAC address';
      case 'arp-learn': return 'notes IP → MAC';
      case 'flood': return 'sends it everywhere';
      case 'transmit': return 'sends it on the cable';
      case 'deliver': return 'hands it to the app';
      case 'configure': return 'sets its address';
      case 'drop': return 'drops it';
    }
  }

  /** Devices in the order the message reached them, with what happened at each layer so far. */
  const columns = $derived.by(() => {
    const order: string[] = [];
    const cells = new Map<string, Map<Layer, string>>();
    const events = player.events.slice(0, player.position);
    for (const e of events) {
      const layer = layerOfEvent(e);
      if (!layer) continue;
      if (!cells.has(e.device)) {
        cells.set(e.device, new Map());
        order.push(e.device);
      }
      cells.get(e.device)!.set(layer, what(e));
    }
    const current = events.at(-1);
    const activeDevice = current?.device ?? null;
    const activeLayer = current ? layerOfEvent(current) : null;
    return order.map((id) => ({ id, device: player.topology.devices[id], cells: cells.get(id)!, activeDevice, activeLayer }));
  });
</script>

<div class="view">
  <p class="hint">
    Each column is a device. The message goes down through the layers when it is sent, across the cable,
    and up again when it arrives. A switch only works at the bottom; a router stops at the network layer.
  </p>
  {#if columns.length === 0}
    <p class="hint">Send a message and step through it: the layers that get used light up here.</p>
  {:else}
    <div class="grid" style="--n:{columns.length}">
      {#each columns as col (col.id)}
        {@const supported = layersOf(col.device)}
        <div class="col" class:here={col.activeDevice === col.id}>
          <div class="name">{col.device.name}</div>
          {#each ORDER as layer (layer)}
            {@const note = col.cells.get(layer)}
            <div
              class="cell"
              class:off={!supported.includes(layer)}
              class:used={note !== undefined}
              class:active={col.activeDevice === col.id && col.activeLayer === layer}
              style="--lc:{LAYER_META[layer].color}"
            >
              <span class="lname">{LAYER_META[layer].name}</span>
              {#if note}<span class="note">{note}</span>{/if}
            </div>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .hint {
    color: var(--muted);
    font-size: 0.9rem;
    margin: 0 0 0.7rem;
  }
  .grid {
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
    padding-bottom: 0.4rem;
  }
  .col {
    flex: 1 0 6.5rem;
    display: flex;
    flex-direction: column;
    gap: 3px;
    border-radius: 8px;
    padding: 0.2rem;
  }
  .col.here {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .name {
    font-weight: 700;
    font-size: 0.85rem;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cell {
    min-height: 3.3rem;
    padding: 0.2rem 0.3rem;
    border-radius: 6px;
    border: 2px dashed #c5cbd8;
    color: #9aa3b5;
    font-size: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .cell:not(.off) {
    border: 2px solid var(--lc);
    background: color-mix(in srgb, var(--lc) 10%, white);
    color: #1d2433;
  }
  .cell.used {
    background: color-mix(in srgb, var(--lc) 30%, white);
  }
  .cell.active {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--lc) 55%, transparent);
    font-weight: 600;
  }
  .lname {
    font-weight: 700;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .note {
    line-height: 1.2;
  }
</style>
