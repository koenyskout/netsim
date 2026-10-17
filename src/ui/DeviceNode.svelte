<script lang="ts">
  import type { Device, Layer, MacEntry, NatEntry } from '../engine/model';
  import { forwardKey, natKey, routeRows } from '../engine/routes';
  import Chip from './Chip.svelte';
  import LayerStack from './LayerStack.svelte';
  import { layersOf } from './colors';

  let {
    device,
    x,
    y,
    activeLayer,
    highlight,
    macTable,
    natTable,
    selected,
    warn,
    onselect,
    onpointerdown,
    draggable,
    cableFrom,
  }: {
    device: Device;
    x: number;
    y: number;
    /** Layer the current step is working at on this device (null if not this device). */
    activeLayer: Layer | null;
    /** Row to highlight: a MAC address (switch) or a port number (host). */
    highlight: string | null;
    macTable?: MacEntry[];
    natTable?: NatEntry[];
    selected: boolean;
    /** True if the configuration has something worth a hint. */
    warn: boolean;
    onselect: () => void;
    onpointerdown?: (e: PointerEvent) => void;
    /** Edit mode: the card can be dragged. */
    draggable?: boolean;
    /** This device is the first end of a cable being drawn. */
    cableFrom?: boolean;
  } = $props();
</script>

<div class="node" style="left:{x}px; top:{y}px">
  <button
    class="icon {device.kind}"
    class:busy={activeLayer !== null}
    class:selected
    class:draggable
    class:cable-from={cableFrom}
    {onpointerdown}
    onclick={onselect}
    aria-label="Settings of {device.name}"
    aria-pressed={selected}
  >
    {#if device.kind === 'host'}
      <svg viewBox="0 0 64 48" aria-hidden="true">
        <rect x="8" y="4" width="48" height="30" rx="3" fill="none" stroke="currentColor" stroke-width="3" />
        <path d="M24 44h16M32 34v10" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
      </svg>
    {:else if device.kind === 'switch'}
      <svg viewBox="0 0 64 48" aria-hidden="true">
        <rect x="4" y="12" width="56" height="24" rx="3" fill="none" stroke="currentColor" stroke-width="3" />
        <path d="M14 24h10M20 20l4 4-4 4M50 24H40M44 20l-4 4 4 4" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    {:else}
      <svg viewBox="0 0 64 48" aria-hidden="true">
        <circle cx="32" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="3" />
        <path d="M32 10v28M18 24h28" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
      </svg>
    {/if}
    <span class="stack"><LayerStack supported={layersOf(device)} active={activeLayer} /></span>
    {#if warn}<span class="warn" title="Something may be wrong here" aria-hidden="true">!</span>{/if}
  </button>

  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="info" onclick={onselect}>
    <div class="name">{device.name}</div>
    {#if device.kind !== 'switch'}
      {#each device.interfaces as iface (iface.id)}
        <div class="addr">
          {#if device.kind === 'router'}<span class="ifname">{iface.id}</span>{/if}
          {#if iface.ip}
            <Chip kind="ip" value={iface.ip} /><span class="prefix">/{iface.prefix}</span>
          {:else}
            <span class="none">no IP</span>
          {/if}
          <Chip kind="mac" value={iface.mac} short />
        </div>
      {/each}
    {/if}
    {#if device.kind === 'host' && device.gateway}
      <div class="gw">gateway <Chip kind="ip" value={device.gateway} /></div>
    {/if}
    {#if device.kind === 'host' && device.dnsServer}
      <div class="gw">DNS <Chip kind="ip" value={device.dnsServer} /></div>
    {/if}
    {#if device.kind === 'host' && (device.apps.length > 0 || device.dnsRecords || device.dhcpServer)}
      <div class="apps">
        {#each [...device.apps, ...(device.dnsRecords ? [{ name: 'DNS server', port: 53 }] : []), ...(device.dhcpServer ? [{ name: 'DHCP server', port: 67 }] : [])] as app (app.port)}
          <div class="app" class:hl={highlight === String(app.port)}>
            <span class="app-name">{app.name}</span>
            <Chip kind="port" value={app.port} />
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if device.kind === 'router'}
    <div class="tables">
    {#if device.nat}
      {@const publicIp = device.interfaces.find((i) => i.id === device.nat!.outside)?.ip}
      <div class="table nat">
        <div class="table-title">NAT table <span class="sub">public {publicIp ?? '?'}</span></div>
        {#each device.nat.forwards as f (forwardKey(f.outsidePort))}
          <div class="row" class:hl={highlight === forwardKey(f.outsidePort)}>
            <Chip kind="port" value={f.outsidePort} /> <span class="arrow">→</span>
            <Chip kind="ip" value={f.insideIp} /><span class="colon">:</span><Chip kind="port" value={f.insidePort} />
            <span class="tag">fixed</span>
          </div>
        {/each}
        {#each natTable ?? [] as e (natKey(e.outsidePort))}
          <div class="row" class:hl={highlight === natKey(e.outsidePort)}>
            <Chip kind="port" value={e.outsidePort} /> <span class="arrow">→</span>
            <Chip kind="ip" value={e.insideIp} /><span class="colon">:</span><Chip kind="port" value={e.insidePort} />
          </div>
        {/each}
        {#if device.nat.forwards.length === 0 && (natTable ?? []).length === 0}
          <div class="empty">empty: nobody inside has talked yet</div>
        {/if}
      </div>
    {/if}
    <div class="table routes">
      <div class="table-title">Routing table</div>
      {#each routeRows(device) as row (row.key)}
        <div class="row" class:hl={highlight === row.key}>
          <span class="net">{row.network}</span>
          <span class="arrow">→</span>
          <span class="via">{row.connected ? row.iface : `via ${row.via ?? '?'}`}</span>
        </div>
      {:else}
        <div class="empty">empty: no networks known</div>
      {/each}
    </div>
    </div>
  {/if}

  {#if device.kind === 'switch'}
    <div class="table solo">
      <div class="table-title">MAC table</div>
      {#each macTable ?? [] as row (row.mac)}
        <div class="row" class:hl={highlight === row.mac}>
          <Chip kind="mac" value={row.mac} short /> <span class="arrow">→</span>
          <span class="port">port {row.port}</span>
        </div>
      {:else}
        <div class="empty">empty: nothing learned yet</div>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* The node is a zero-size anchor at the device centre; everything is placed around it. */
  .node {
    position: absolute;
    width: 0;
    height: 0;
    z-index: 2;
  }
  .icon {
    padding: 0;
    cursor: pointer;
    font: inherit;
    position: absolute;
    left: -86px;
    top: -42px;
    width: 172px;
    height: 84px;
    display: flex;
    align-items: center;
    justify-content: space-around;
    padding: 0 8px;
    background: var(--panel);
    border: 3px solid var(--line);
    border-radius: 14px;
    color: #4b5568;
    transition: box-shadow 0.25s;
  }
  .icon svg {
    width: 56px;
  }
  .icon:hover {
    border-color: var(--accent);
  }
  .draggable {
    cursor: grab;
    touch-action: none;
  }
  .cable-from {
    border-color: #16a34a;
    box-shadow: 0 0 0 6px rgb(22 163 74 / 0.3);
  }
  .selected {
    border-color: var(--accent);
    background: #eef3ff;
  }
  .warn {
    position: absolute;
    top: -12px;
    right: -12px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #f5b82e;
    color: #3b2a00;
    font-weight: 800;
    font-size: 16px;
    display: grid;
    place-items: center;
    border: 2px solid white;
  }
  .ifname {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--muted);
  }
  .info {
    cursor: pointer;
  }
  .busy {
    box-shadow: 0 0 0 6px rgb(37 99 235 / 0.25);
    border-color: var(--accent);
  }
  .stack {
    display: block;
  }
  .info {
    position: absolute;
    top: 54px;
    left: 0;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    font-size: 14px;
    white-space: nowrap;
  }
  .name {
    font-size: 18px;
    font-weight: 700;
  }
  .addr,
  .gw {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .gw {
    font-size: 12px;
    color: var(--muted);
  }
  .prefix {
    color: var(--muted);
    font-family: var(--mono);
    font-size: 13px;
    margin-left: -3px;
  }
  .none {
    color: var(--bad);
  }
  .apps {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 3px;
  }
  .app {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 2px 8px;
    border: 2px solid var(--c-app);
    background: color-mix(in srgb, var(--c-app) 10%, white);
    border-radius: 8px;
    transition: box-shadow 0.25s;
  }
  .app-name {
    font-weight: 600;
  }
  .hl {
    box-shadow: 0 0 0 5px rgb(250 204 21 / 0.65);
    background: #fef9c3;
  }
  /* Router tables stack above the card, bottom-anchored. */
  .tables {
    position: absolute;
    left: 0;
    bottom: 54px;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .table {
    min-width: 200px;
    padding: 6px 8px;
    background: var(--panel);
    border: 2px solid var(--c-link);
    border-radius: 10px;
    font-size: 13px;
  }
  .solo {
    position: absolute;
    left: 0;
    bottom: 54px;
    transform: translateX(-50%);
  }
  .sub {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 500;
    margin-left: 0.3em;
  }
  .colon {
    margin: 0 -3px;
    color: var(--muted);
  }
  .tag {
    font-size: 10px;
    color: var(--muted);
    margin-left: auto;
  }
  .table-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--c-link);
    filter: brightness(0.8);
    margin-bottom: 3px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 4px;
    border-radius: 6px;
  }
  .row .port {
    font-family: var(--mono);
  }
  .arrow {
    color: var(--muted);
  }
  .routes .net,
  .routes .via {
    font-family: var(--mono);
  }
  .routes .via {
    color: var(--muted);
  }
  .empty {
    color: var(--muted);
    font-style: italic;
  }
</style>
