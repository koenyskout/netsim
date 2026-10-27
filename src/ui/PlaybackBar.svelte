<script lang="ts">
  import type { Player } from './player.svelte';

  let { player }: { player: Player } = $props();

  const length = $derived(player.events.length);
  // Positions just after each hop, shown as ticks on the scrubber.
  const ticks = $derived(
    player.events.flatMap((e, i) => (e.kind === 'transmit' ? [((i + 1) / Math.max(length, 1)) * 100] : [])),
  );
  const empty = $derived(length === 0);
</script>

<div class="bar">
  <div class="buttons">
    <button onclick={() => player.restart()} disabled={empty || player.atStart} title="Back to start (Home)" aria-label="Back to start">⏮</button>
    <button onclick={() => player.prevHop()} disabled={empty || player.atStart} title="Previous hop (Shift+←)" aria-label="Previous hop">⏪</button>
    <button onclick={() => player.prev()} disabled={empty || player.atStart} title="Step back (←)" aria-label="Step back">◀</button>
    <button class="step" onclick={() => player.next()} disabled={empty || player.atEnd} title="Step forward (→ or Space)" aria-label="Step forward">▶</button>
    <button onclick={() => player.nextHop()} disabled={empty || player.atEnd} title="Next hop (Shift+→)" aria-label="Next hop">⏩</button>
  </div>

  <div class="scrub">
    <input
      type="range"
      min="0"
      max={length}
      value={player.position}
      disabled={empty}
      oninput={(e) => player.seek(Number(e.currentTarget.value))}
      aria-label="Position in the simulation"
    />
    <div class="ticks" aria-hidden="true">
      {#each ticks as t}<span style="left:{t}%"></span>{/each}
    </div>
    <span class="count">{player.position} / {length}</span>
  </div>

</div>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    flex-wrap: wrap;
  }
  .buttons {
    display: flex;
    gap: 0.35rem;
  }
  button {
    min-width: 2.7rem;
    height: 2.7rem;
    font-size: 1.15rem;
    border: 2px solid var(--line);
    border-radius: 10px;
    background: var(--panel);
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    border-color: var(--accent);
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .step {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
    min-width: 3.4rem;
  }
  .scrub {
    flex: 1;
    min-width: 12rem;
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }
  input[type='range'] {
    flex: 1;
    accent-color: var(--accent);
  }
  .ticks {
    position: absolute;
    left: 8px;
    right: calc(5rem + 8px);
    bottom: -4px;
    height: 6px;
    pointer-events: none;
  }
  .ticks span {
    position: absolute;
    width: 3px;
    height: 6px;
    background: var(--muted);
    border-radius: 1px;
    transform: translateX(-50%);
  }
  .count {
    font-family: var(--mono);
    font-size: 0.85rem;
    color: var(--muted);
    width: 4.2rem;
    text-align: right;
  }
</style>
