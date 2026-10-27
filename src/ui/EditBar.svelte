<script lang="ts">
  import type { Player } from './player.svelte';
  import TrashButton from './TrashButton.svelte';

  let { player }: { player: Player } = $props();
</script>

<div class="bar" role="toolbar" aria-label="Edit the network">
  <div class="tools">
    <button onclick={() => player.add('host')}>+ Computer</button>
    <button onclick={() => player.add('switch')}>+ Switch</button>
    <button onclick={() => player.add('hub')}>+ Hub</button>
    <button onclick={() => player.add('router')}>+ Router</button>
    <button class:on={player.cableTool} aria-pressed={player.cableTool} onclick={() => { player.cableTool = !player.cableTool; player.cableFrom = null; player.editMessage = ''; }}>
      Cable
    </button>
    <TrashButton
      label="Delete the selected device"
      disabled={!player.selected}
      onclick={() => player.selected && player.remove(player.selected)}
    />
  </div>
  <p class="help" class:error={player.editMessage !== ''}>
    {#if player.editMessage}
      {player.editMessage}
    {:else if player.cableTool}
      {player.cableFrom ? 'Now click the second device.' : 'Click two devices to connect them with a cable.'}
    {:else}
      Drag devices to move them. Click a cable to remove it.
    {/if}
  </p>
</div>

<style>
  .bar {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    z-index: 6;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    max-width: 70%;
  }
  .tools {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
    padding: 0.35rem;
    background: color-mix(in srgb, var(--panel) 92%, transparent);
    border: 2px solid var(--line);
    border-radius: 10px;
  }
  button {
    padding: 0.3rem 0.7rem;
    border: 2px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    border-color: var(--accent);
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .on {
    background: #16a34a;
    border-color: #16a34a;
    color: white;
  }
  .help {
    margin: 0;
    padding: 0.25rem 0.6rem;
    font-size: 0.9rem;
    color: var(--muted);
    background: color-mix(in srgb, var(--panel) 92%, transparent);
    border-radius: 8px;
    align-self: flex-start;
  }
  .error {
    color: var(--bad);
    font-weight: 600;
  }
</style>
