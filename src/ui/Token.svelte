<script lang="ts">
  import { untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import type { Layer } from '../engine/model';
  import { LAYER_META } from './colors';
  import type { Token } from './scene';

  let {
    token,
    x,
    y,
    spawn,
  }: {
    token: Token;
    x: number;
    y: number;
    /** Where to start from when the token first appears (e.g. a flooded copy leaving the switch). */
    spawn?: { x: number; y: number };
  } = $props();

  // Concentric rings, outermost layer first; the application message is the core.
  const PAD = 8;
  const CORE_W = 50;
  const CORE_H = 36;

  const layers: Layer[] = $derived([...token.packet.headers.map((h) => h.layer), 'application']);
  const rings = $derived(layers.length - 1);
  const outer = $derived(layers[0]);

  // Start at the spawn point (if any) and move to the real position on the next frame.
  let px = $state(untrack(() => spawn?.x ?? x));
  let py = $state(untrack(() => spawn?.y ?? y));
  let armed = false;

  // Move in on the next frame so the CSS transition plays from the spawn point.
  $effect(() => {
    const nx = x;
    const ny = y;
    if (!armed) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          armed = true;
          px = nx;
          py = ny;
        }),
      );
      return;
    }
    px = nx;
    py = ny;
  });
</script>

<div class="token" style="transform: translate({px}px, {py}px)" transition:fade={{ duration: 200 }}>
  <div class="box" style="width:{CORE_W + 2 * PAD * rings}px; height:{CORE_H + 2 * PAD * rings}px">
    {#each layers as layer, i (layer)}
      <div
        class="ring"
        class:opening={token.opening === layer}
        class:core={layer === 'application'}
        style="inset:{i * PAD}px; --lc:{LAYER_META[layer].color}"
      >
        {#if layer === 'application'}✉{/if}
      </div>
    {/each}
    <div class="tag" style="--lc:{LAYER_META[outer].color}">{LAYER_META[outer].name}</div>
    {#if token.status === 'dropped'}<div class="badge bad">✕</div>{/if}
    {#if token.status === 'delivered'}<div class="badge good">✓</div>{/if}
  </div>
</div>

<style>
  .token {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 5;
    pointer-events: none;
    transition: transform var(--dur, 800ms) cubic-bezier(0.45, 0.05, 0.3, 1);
  }
  .box {
    position: absolute;
    left: 0;
    top: 0;
    transform: translate(-50%, -50%);
    transition:
      width 0.4s ease,
      height 0.4s ease;
  }
  .ring {
    position: absolute;
    border: 3px solid var(--lc);
    border-radius: 9px;
    background: color-mix(in srgb, var(--lc) 20%, white);
    transition: inset 0.4s ease;
    animation: close 0.45s ease-out;
    display: grid;
    place-items: center;
    font-size: 17px;
    color: var(--lc);
  }
  .opening {
    border-style: dashed;
    animation: open 0.8s ease-in-out infinite alternate;
  }
  @keyframes close {
    from {
      transform: scale(1.5);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  @keyframes open {
    from {
      transform: scale(1);
    }
    to {
      transform: scale(1.12);
    }
  }
  .tag {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 5px);
    transform: translateX(-50%);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
    padding: 1px 7px;
    border-radius: 999px;
    background: white;
    border: 2px solid var(--lc);
    color: #1d2433;
  }
  .badge {
    position: absolute;
    right: -12px;
    top: -12px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: white;
    font-weight: 800;
    font-size: 14px;
  }
  .bad {
    background: var(--bad);
  }
  .good {
    background: var(--good);
  }
</style>
