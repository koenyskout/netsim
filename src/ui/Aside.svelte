<script lang="ts">
  import ConfigPanel from './ConfigPanel.svelte';
  import LayerView from './LayerView.svelte';
  import Inspector from './Inspector.svelte';
  import type { Player } from './player.svelte';

  let { player, onclose }: { player: Player; onclose: () => void } = $props();
</script>

<aside>
  <div class="tabs" role="tablist">
    <button role="tab" aria-selected={player.tab === 'packet'} onclick={() => (player.tab = 'packet')}>Packet</button>
    <button role="tab" aria-selected={player.tab === 'layers'} onclick={() => (player.tab = 'layers')}>Layers</button>
    <button role="tab" aria-selected={player.tab === 'device'} onclick={() => (player.tab = 'device')}>Device settings</button>
    <button class="close" onclick={onclose} aria-label="Hide the side panel" title="Hide the side panel (I)">▸</button>
  </div>
  <div class="body">
    {#if player.tab === 'packet'}
      <Inspector {player} />
    {:else if player.tab === 'layers'}
      <LayerView {player} />
    {:else}
      <ConfigPanel {player} />
    {/if}
  </div>
</aside>

<style>
  aside {
    width: clamp(18rem, 27vw, 26rem);
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border-left: 1px solid var(--line);
    min-height: 0;
  }
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--line);
  }
  .tabs button {
    flex: 1;
    padding: 0.55rem 0.5rem;
    border: 0;
    border-bottom: 3px solid transparent;
    background: none;
    cursor: pointer;
    font-weight: 600;
    color: var(--muted);
  }
  .tabs .close {
    flex: none;
    padding: 0.55rem 0.8rem;
    border-left: 1px solid var(--line);
  }
  .tabs button[aria-selected='true'] {
    color: var(--ink);
    border-bottom-color: var(--accent);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.9rem 1.1rem;
  }
</style>
