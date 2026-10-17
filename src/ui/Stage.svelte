<script lang="ts">
  import { STAGE } from '../presets/types';
  import { warningsFor } from '../engine/validate';
  import DeviceNode from './DeviceNode.svelte';
  import type { Player } from './player.svelte';
  import Token from './Token.svelte';

  let { player }: { player: Player } = $props();

  let areaW = $state(1200);
  let areaH = $state(640);
  // What must stay visible: labels hang off the cards (sideways, and mostly downwards), so fit a box a bit larger than the stage.
  const BOX = { x0: -70, x1: STAGE.width + 70, y0: -20, y1: STAGE.height + 90 };
  const scale = $derived(Math.min(areaW / (BOX.x1 - BOX.x0), areaH / (BOX.y1 - BOX.y0), 1.6));
  const offset = $derived({
    x: (areaW - (BOX.x1 - BOX.x0) * scale) / 2 - BOX.x0 * scale,
    y: (areaH - (BOX.y1 - BOX.y0) * scale) / 2 - BOX.y0 * scale,
  });

  /** A switch's table goes above or below it, whichever side has more free room. */
  function tableBelow(id: string): boolean {
    const me = positions[id];
    // Room up to the stage edge, or up to the nearest device in a band around this one.
    // Labels hang below a device, so a device above takes more room than its centre suggests.
    let above = me.y;
    let below = STAGE.height - me.y;
    for (const [other, p] of Object.entries(positions)) {
      if (other === id) continue;
      // A router's tables stand on top of it, wider than the router itself.
      if (player.topology.devices[other]?.kind === 'router' && Math.abs(p.x - me.x) < 260 && Math.abs(p.y - me.y) < 170) {
        above = Math.min(above, Math.max(0, me.y - p.y));
      }
      if (Math.abs(p.x - me.x) > 220) continue;
      const dy = p.y - me.y;
      if (dy < -20) above = Math.min(above, -dy - 110);
      else if (dy > 20) below = Math.min(below, dy - 40);
    }
    return below > above;
  }

  const positions = $derived(player.positions);
  const devices = $derived(Object.values(player.topology.devices));
  const scene = $derived(player.scene);
  const event = $derived(scene.event);

  // Which row of which device's table the current step is using.
  function highlightFor(deviceId: string): string | null {
    if (!event || event.device !== deviceId) return null;
    if (event.kind === 'learn') return event.mac;
    if (event.kind === 'lookup' && event.table !== 'arp') return event.row;
    if (event.kind === 'nat') return event.row;
    if (event.kind === 'deliver') return String(event.port);
    return null;
  }

  function isLit(a: { device: string; iface: string }, b: { device: string; iface: string }): boolean {
    const l = scene.litLink;
    if (!l) return false;
    return (
      (a.device === l.from && a.iface === l.fromIface && b.device === l.to && b.iface === l.toIface) ||
      (b.device === l.from && b.iface === l.fromIface && a.device === l.to && a.iface === l.toIface)
    );
  }

  // ---- editing: dragging devices and clicking cables ----
  let dragged = false;

  function startDrag(id: string, e: PointerEvent) {
    if (!player.editMode || e.button !== 0) return;
    const start = positions[id];
    const x0 = e.clientX;
    const y0 = e.clientY;
    dragged = false;
    const move = (m: PointerEvent) => {
      const dx = (m.clientX - x0) / scale;
      const dy = (m.clientY - y0) / scale;
      if (!dragged && Math.hypot(dx, dy) * scale < 5) return;
      dragged = true;
      player.moveDevice(
        id,
        Math.round(Math.min(STAGE.width - 90, Math.max(90, start.x + dx))),
        Math.round(Math.min(STAGE.height - 50, Math.max(50, start.y + dy))),
      );
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      // The click that follows a drag must not select or connect anything.
      setTimeout(() => (dragged = false), 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function clicked(id: string) {
    if (dragged) return;
    if (player.editMode && player.cableTool) player.cableClick(id);
    else player.select(id);
  }

  const CARD_HALF = { w: 52, h: 36 };

  /** A point on the cable just outside the device card at `from`: used for port labels. */
  function labelPos(from: { x: number; y: number }, to: { x: number; y: number }) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const toEdge = Math.min(CARD_HALF.w / (Math.abs(ux) || 1e-6), CARD_HALF.h / (Math.abs(uy) || 1e-6));
    const dist = toEdge + 20;
    return { x: from.x + ux * dist, y: from.y + uy * dist };
  }
</script>

<div class="area" bind:clientWidth={areaW} bind:clientHeight={areaH}>
  <div
    class="stage"
    style="width:{STAGE.width}px; height:{STAGE.height}px; transform: scale({scale}); left:{offset.x}px; top:{offset.y}px; --dur:{Math.min(player.stepMs * 0.85, 1000)}ms"
  >
    <svg class="cables" width={STAGE.width} height={STAGE.height} aria-hidden="true">
      {#each player.topology.links as link, i (link.a.device + link.a.iface + link.b.device + link.b.iface)}
        {@const a = positions[link.a.device]}
        {@const b = positions[link.b.device]}
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} class="cable" class:lit={isLit(link.a, link.b)} />
        {#if player.editMode}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} class="hit" onclick={() => player.removeCable(i)}>
            <title>Click to remove this cable</title>
          </line>
        {/if}
        {#each [{ end: link.a, from: a, to: b }, { end: link.b, from: b, to: a }] as { end, from, to } (end.device + end.iface)}
          {#if player.topology.devices[end.device].kind !== 'host'}
            {@const p = labelPos(from, to)}
            <text x={p.x} y={p.y} class="port-label" text-anchor="middle" dominant-baseline="middle">{end.iface}</text>
          {/if}
        {/each}
      {/each}
    </svg>

    {#each devices as device (device.id)}
      <DeviceNode
        {device}
        x={positions[device.id].x}
        y={positions[device.id].y}
        activeLayer={event && event.device === device.id ? scene.activeLayer : null}
        highlight={highlightFor(device.id)}
        macTable={player.macTables[device.id]}
        natTable={player.natTables[device.id]}
        selected={player.selected === device.id}
        warn={player.showHints && warningsFor(player.topology, device.id).length > 0}
        onselect={() => clicked(device.id)}
        onpointerdown={(e) => startDrag(device.id, e)}
        draggable={player.editMode}
        cableFrom={player.cableFrom === device.id}
        tableBelow={device.kind === 'switch' && tableBelow(device.id)}
      />
    {/each}

    {#each scene.tokens as token (token.pid)}
      {@const at = positions[token.device]}
      {@const from = token.spawnFrom ? positions[token.spawnFrom] : undefined}
      <Token {token} x={at.x} y={at.y} spawn={from} />
    {/each}
  </div>
</div>

<style>
  .area {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .stage {
    position: absolute;
    transform-origin: 0 0;
  }
  .cables {
    position: absolute;
    left: 0;
    top: 0;
  }
  .cable {
    stroke: #a4aec0;
    stroke-width: 5;
    stroke-linecap: round;
    transition: stroke 0.25s;
  }
  .hit {
    stroke: transparent;
    stroke-width: 22;
    pointer-events: stroke;
    cursor: pointer;
  }
  .hit:hover {
    stroke: rgb(220 38 38 / 0.35);
  }
  .lit {
    stroke: var(--accent);
    stroke-width: 7;
  }
  .port-label {
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 700;
    fill: #1d2433;
    paint-order: stroke;
    stroke: var(--bg);
    stroke-width: 6px;
  }
</style>
