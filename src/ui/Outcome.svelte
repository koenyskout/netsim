<script lang="ts">
  import { DROP_TEXT } from '../engine/explain';
  import type { Player } from './player.svelte';

  let { player }: { player: Player } = $props();

  const result = $derived(player.result);
  const o = $derived(result?.outcome);
  const name = (id: string | undefined) => (id ? player.topology.devices[id]?.name : '');
</script>

{#if o && player.atEnd}
  {#if o.note}
    <div class="banner {o.delivered ? 'good' : 'bad'}">{o.note}</div>
  {:else if o.delivered}
    <div class="banner good">
      <strong>✓ Delivered.</strong>
      {#if o.replyDelivered === false && o.replyReason}
        The message arrived, but the reply was lost at {name(o.replyDevice)}: {DROP_TEXT[o.replyReason].title}.
        {DROP_TEXT[o.replyReason].text}
      {:else if o.replyDelivered}
        The message arrived and the reply came back.
      {/if}
    </div>
  {:else if o.reason}
    <div class="banner bad">
      <strong>✕ Not delivered: {DROP_TEXT[o.reason].title}</strong>
      <span>at {name(o.device)}. {DROP_TEXT[o.reason].text}</span>
    </div>
  {/if}
{/if}

<style>
  .banner {
    margin: -0.5rem -1rem;
    padding: 0.5rem 1rem;
    border-left: 6px solid;
    font-size: 0.85em;
    flex: 1;
  }
  .good {
    background: #e6f6ec;
    border-color: var(--good);
  }
  .bad {
    background: #fdecec;
    border-color: var(--bad);
  }
  strong {
    margin-right: 0.4rem;
  }
</style>
