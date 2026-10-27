<script lang="ts">
  import type { ArpMessage, Header, Layer } from '../engine/model';
  import Chip from './Chip.svelte';
  import Envelope from './Envelope.svelte';
  import { ARP_META, LAYER_META } from './colors';

  /** Old values that were just replaced, by field name. */
  type Ghost = Record<string, string | number>;

  let {
    headers,
    message,
    arp,
    opening,
    added,
    ghost,
  }: {
    /** Outermost header first. */
    headers: Header[];
    message: string;
    /** An ARP question or answer instead of an application message. */
    arp?: ArpMessage;
    /** Layer currently being opened. */
    opening?: Layer;
    /** Layer that was just added. */
    added?: Layer;
    ghost?: Ghost;
  } = $props();

  const head = $derived(headers[0]);
  const layer: Layer = $derived(head ? head.layer : 'application');
  const meta = $derived(!head && arp ? ARP_META : LAYER_META[layer]);
</script>

{#key layer}
  <div
    class="env"
    class:opening={opening === layer}
    class:added={added === layer}
    style="--lc:{meta.color}"
  >
    <div class="bar">
      <span class="name">{meta.name}</span>
      <span class="purpose">{meta.purpose}</span>
    </div>

    <div class="fields">
      {#if head?.layer === 'link'}
        {#if ghost?.srcMac !== undefined}<Chip kind="mac" value={ghost.srcMac} ghost />{/if}
        <Chip kind="mac" value={head.srcMac} changed={ghost?.srcMac !== undefined} />
        <span class="arrow">→</span>
        {#if ghost?.dstMac !== undefined}<Chip kind="mac" value={ghost.dstMac} ghost />{/if}
        <Chip kind="mac" value={head.dstMac} changed={ghost?.dstMac !== undefined} />
      {:else if head?.layer === 'network'}
        {#if ghost?.srcIp !== undefined}<Chip kind="ip" value={ghost.srcIp} ghost />{/if}
        <Chip kind="ip" value={head.srcIp} changed={ghost?.srcIp !== undefined} />
        <span class="arrow">→</span>
        {#if ghost?.dstIp !== undefined}<Chip kind="ip" value={ghost.dstIp} ghost />{/if}
        <Chip kind="ip" value={head.dstIp} changed={ghost?.dstIp !== undefined} />
      {:else if head?.layer === 'transport'}
        {#if ghost?.srcPort !== undefined}<Chip kind="port" value={ghost.srcPort} ghost />{/if}
        <Chip kind="port" value={head.srcPort} changed={ghost?.srcPort !== undefined} />
        <span class="arrow">→</span>
        {#if ghost?.dstPort !== undefined}<Chip kind="port" value={ghost.dstPort} ghost />{/if}
        <Chip kind="port" value={head.dstPort} changed={ghost?.dstPort !== undefined} />
      {:else if arp?.op === 'request'}
        <span class="message">Who has</span> <Chip kind="ip" value={arp.targetIp} /><span class="message">?</span>
        <span class="tell">Tell <Chip kind="ip" value={arp.senderIp} /> <Chip kind="mac" value={arp.senderMac} /></span>
      {:else if arp}
        <Chip kind="ip" value={arp.senderIp} /> <span class="message">is at</span> <Chip kind="mac" value={arp.senderMac} />
      {:else}
        <span class="message">“{message}”</span>
      {/if}
    </div>

    {#if head}
      <Envelope headers={headers.slice(1)} {message} {arp} {opening} {added} {ghost} />
    {/if}
  </div>
{/key}

<style>
  .env {
    border: 3px solid var(--lc);
    border-radius: 12px;
    padding: 0.5rem 0.65rem 0.65rem;
    background: color-mix(in srgb, var(--lc) 11%, white);
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    transform-origin: center;
  }
  .bar {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .name {
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-size: 0.78rem;
    color: var(--lc);
    filter: brightness(0.8);
  }
  .purpose {
    font-size: 0.78rem;
    color: var(--muted);
  }
  .fields {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    font-size: 1rem;
  }
  .arrow {
    color: var(--muted);
  }
  .tell {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--muted);
  }
  .message {
    font-size: 1.1rem;
    font-weight: 600;
  }
  .added {
    animation: wrap 0.55s ease-out;
  }
  @keyframes wrap {
    from {
      transform: scale(1.1);
      opacity: 0.25;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  .opening {
    border-style: dashed;
    animation: open 0.9s ease-in-out infinite alternate;
  }
  @keyframes open {
    from {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--lc) 0%, transparent);
    }
    to {
      box-shadow: 0 0 0 6px color-mix(in srgb, var(--lc) 35%, transparent);
    }
  }
</style>
