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
    padding: 0.55rem 0.9rem;
    border-radius: 10px;
    border: 2px solid;
    font-size: 1rem;
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
