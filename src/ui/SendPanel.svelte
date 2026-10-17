<script lang="ts">
  import { isValidIp } from '../engine/addressing';
  import type { Action } from '../engine/model';
  import type { Player } from './player.svelte';

  let { player, compact = false }: { player: Player; compact?: boolean } = $props();

  const hosts = $derived(Object.values(player.topology.devices).filter((d) => d.kind === 'host'));
  const first = $derived(player.preset.suggestions[0]?.action);

  let from = $state('');
  let dstIp = $state('');
  let dstPort = $state('80');
  let message = $state('Hello');
  // The free-form message is one click away; scenarios offer ready-made messages first.
  let custom = $state(false);
  const formOpen = $derived(custom || player.preset.suggestions.length === 0);

  // Start the form from the first suggestion whenever a new preset is loaded.
  function fill(a: Action) {
    from = a.from;
    if (a.type === 'dhcp') return;
    dstIp = a.dstName || a.dstIp;
    dstPort = String(a.dstPort);
    message = a.message;
  }

  const isName = (text: string) => !isValidIp(text) && /^[A-Za-z][A-Za-z0-9.-]*$/.test(text.trim());
  const hasDhcp = $derived(hosts.some((h) => h.kind === 'host' && h.dhcpServer));

  $effect(() => {
    if (first) fill(first);
  });

  // Editing the network must not throw away what was typed; only repair a sender that no longer exists.
  $effect(() => {
    if (!hosts.some((h) => h.id === from)) from = hosts[0]?.id ?? '';
  });

  const portNumber = $derived(Number(dstPort));
  const valid = $derived(
    from !== '' && (isValidIp(dstIp) || isName(dstIp)) && Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535,
  );

  function submit(e: Event) {
    e.preventDefault();
    if (!valid) return;
    const to = dstIp.trim();
    player.send(
      isName(to)
        ? { type: 'send', from, dstIp: '', dstName: to, dstPort: portNumber, message, app: 'client' }
        : { type: 'send', from, dstIp: to, dstPort: portNumber, message, app: 'client' },
    );
  }
</script>

<div class="panel">
  {#if player.preset.suggestions.length > 0}
    <div class="suggest">
      <span class="label">Send:</span>
      {#each player.preset.suggestions as s (s.label)}
        <button class="chip" onclick={() => { fill(s.action); player.send(s.action); }}>{s.label}</button>
      {/each}
      {#if !compact}
        <button class="chip ghost" aria-expanded={custom} onclick={() => (custom = !custom)}>{custom ? 'Hide own message' : 'Own message…'}</button>
      {/if}
      <button class="chip ghost" onclick={() => player.reset()} title="Back to the original settings; forget what the switches learned">Reset</button>
    </div>
  {/if}

  {#if !compact && formOpen}
  <form onsubmit={submit}>
    <label>From
      <select bind:value={from}>
        {#each hosts as h (h.id)}<option value={h.id}>{h.name}</option>{/each}
      </select>
    </label>
    <label>To (IP or name)
      <input bind:value={dstIp} class:bad={dstIp !== '' && !isValidIp(dstIp) && !isName(dstIp)} size="16" placeholder="192.168.1.20" />
    </label>
    <label>Port
      <input bind:value={dstPort} class:bad={dstPort !== '' && !(portNumber >= 1 && portNumber <= 65535)} size="5" inputmode="numeric" />
    </label>
    <label class="grow">Message
      <input bind:value={message} />
    </label>
    <button class="send" type="submit" disabled={!valid}>Send</button>
    {#if hasDhcp}
      <button type="button" disabled={from === ''} onclick={() => player.send({ type: 'dhcp', from })} title="The selected computer asks the network for an address (DHCP)">
        Ask for an address
      </button>
    {/if}
    <button type="button" onclick={() => player.reset()} title="Back to the original settings; forget what the switches learned">Reset</button>
  </form>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .suggest {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }
  .label {
    color: var(--muted);
    font-size: 0.9rem;
  }
  form {
    display: flex;
    gap: 0.7rem;
    align-items: end;
    flex-wrap: wrap;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .grow {
    flex: 1;
    min-width: 8rem;
  }
  input,
  select {
    padding: 0.4rem 0.5rem;
    border: 2px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    font-size: 1rem;
    color: var(--ink);
  }
  input.bad {
    border-color: var(--bad);
  }
  button {
    padding: 0.45rem 0.9rem;
    border: 2px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .ghost {
    border-style: dashed;
    color: var(--muted);
  }
  .chip {
    border-radius: 999px;
    padding: 0.25rem 0.8rem;
    font-size: 0.9rem;
  }
  .send {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
    font-weight: 600;
  }
  .send:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
