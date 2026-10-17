<script lang="ts">
  import type { Layer } from '../engine/model';
  import { LAYER_META } from './colors';

  let { supported, active }: { supported: readonly Layer[]; active: Layer | null } = $props();

  const ORDER: Layer[] = ['application', 'transport', 'network', 'link'];
</script>

<div class="stack" aria-label="Layers this device works at">
  {#each ORDER as layer (layer)}
    <div
      class="cell"
      class:off={!supported.includes(layer)}
      class:active={active === layer}
      style="--lc:{LAYER_META[layer].color}"
    >
      {LAYER_META[layer].name}
    </div>
  {/each}
</div>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 76px;
  }
  .cell {
    font-size: 10px;
    font-weight: 700;
    text-align: center;
    padding: 1px 0;
    line-height: 1.35;
    border-radius: 4px;
    border: 2px solid var(--lc);
    background: color-mix(in srgb, var(--lc) 20%, white);
    color: #1d2433;
    transition:
      transform 0.25s,
      box-shadow 0.25s;
  }
  /* Layers this device does not implement: dashed and faded, so you can see what it skips. */
  .off {
    border-style: dashed;
    background: transparent;
    color: #9aa3b5;
    border-color: #c5cbd8;
  }
  .active {
    transform: scale(1.12);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--lc) 40%, transparent);
    z-index: 1;
  }
</style>
