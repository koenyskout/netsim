<script lang="ts">
  import Envelope from './Envelope.svelte';
  import { LAYER_META } from './colors';
  import type { Player } from './player.svelte';
  import type { Layer } from '../engine/model';

  let { player }: { player: Player } = $props();

  const scene = $derived(player.scene);
  const event = $derived(scene.event);
  const focus = $derived(scene.focus);
  const added = $derived(event?.kind === 'add-layer' ? event.layer : undefined);
  const ghost = $derived(
    event?.kind === 'rewrite'
      ? { [event.field]: event.from }
      : event?.kind === 'nat'
        ? Object.fromEntries(event.changes.map((c) => [c.field, c.from]))
        : undefined,
  );
  const where = $derived(focus ? player.topology.devices[event!.kind === 'transmit' ? event!.to.device : event!.device].name : '');
  const legend: Layer[] = ['application', 'transport', 'network', 'link'];
</script>

<div>
  {#if focus}
    <p class="where">Now at <strong>{where}</strong></p>
    <div class="env-wrap">
      <Envelope
        headers={focus.packet.headers}
        message={focus.packet.message}
        opening={focus.opening}
        {added}
        {ghost}
      />
    </div>
  {:else}
    <p class="hint">Send a message to see it travel. The packet is shown here layer by layer.</p>
    <ul class="legend">
      {#each legend as layer (layer)}
        <li style="--lc:{LAYER_META[layer].color}">
          <strong>{LAYER_META[layer].name}</strong>
          <span>{LAYER_META[layer].purpose}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .where {
    margin: 0 0 0.8rem;
    color: var(--muted);
  }
  .hint {
    color: var(--muted);
    margin: 0 0 1rem;
  }
  .legend {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .legend li {
    display: flex;
    flex-direction: column;
    padding: 0.5rem 0.7rem;
    border: 3px solid var(--lc);
    border-radius: 10px;
    background: color-mix(in srgb, var(--lc) 11%, white);
  }
  .legend span {
    font-size: 0.85rem;
    color: var(--muted);
  }
</style>
