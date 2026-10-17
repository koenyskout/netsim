<script lang="ts">
  import { untrack } from 'svelte';
  import { encodeHash, exportScene, parseScene } from '../engine/share';
  import type { Player } from './player.svelte';

  let { player, onclose }: { player: Player; onclose: () => void } = $props();

  let dialog: HTMLDialogElement;
  let text = $state(untrack(() => exportScene(player.design())));
  let status = $state('');
  let failed = $state(false);

  $effect(() => {
    dialog.showModal();
  });

  const say = (msg: string, bad = false) => {
    status = msg;
    failed = bad;
  };

  const link = () => `${location.origin}${location.pathname}#${encodeHash(player.design())}`;

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value);
      say(`${what} copied.`);
    } catch {
      say('Copying is not allowed here. Select the text and copy it yourself.', true);
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([exportScene(player.design())], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'network.netsim.json';
    a.click();
    URL.revokeObjectURL(url);
    say('Downloaded.');
  }

  function load() {
    const r = parseScene(text);
    if (!r.ok) return say(r.error, true);
    player.loadScene(r.scene, 'Imported network');
    onclose();
  }

  async function pickFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) return say('That file is too big to be a network.', true);
    text = await file.text();
    load();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialog} {onclose} onclick={(e) => e.target === dialog && onclose()} aria-labelledby="share-title">
  <h2 id="share-title">Share or load a network</h2>
  <p class="hint">
    The link contains the whole network. Anyone who opens it sees the same devices and settings, nothing is stored on a server.
  </p>
  <div class="row">
    <button class="primary" onclick={() => copy(link(), 'Link')}>Copy link</button>
    <button onclick={download}>Download file</button>
    <button onclick={() => copy(text, 'JSON')}>Copy JSON</button>
  </div>
  <label>
    Network as JSON <span class="hint">(edit it, or paste one, then press Load)</span>
    <textarea bind:value={text} spellcheck="false" rows="12"></textarea>
  </label>
  <div class="row">
    <button onclick={load}>Load this</button>
    <label class="file">Open file… <input type="file" accept=".json,application/json" onchange={pickFile} /></label>
    <span class="grow"></span>
    <button onclick={onclose}>Close</button>
  </div>
  <p class="status" class:failed role="status">{status}</p>
</dialog>

<style>
  dialog {
    width: min(42rem, 92vw);
    border: 2px solid var(--line);
    border-radius: 14px;
    padding: 1rem 1.2rem;
    background: var(--panel);
    color: var(--ink);
  }
  dialog::backdrop {
    background: rgb(15 23 42 / 0.45);
  }
  h2 {
    margin: 0 0 0.3rem;
    font-size: 1.15rem;
  }
  .hint {
    color: var(--muted);
    font-size: 0.85rem;
    margin: 0 0 0.6rem;
    font-weight: 400;
  }
  .row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
    margin: 0.5rem 0;
  }
  .grow {
    flex: 1;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-weight: 600;
    font-size: 0.9rem;
  }
  textarea {
    font-family: var(--mono);
    font-size: 0.8rem;
    padding: 0.5rem;
    border: 2px solid var(--line);
    border-radius: 8px;
    resize: vertical;
  }
  button,
  .file {
    padding: 0.35rem 0.8rem;
    border: 2px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    cursor: pointer;
    font-weight: 400;
    font-size: 1rem;
    flex-direction: row;
  }
  button:hover,
  .file:hover {
    border-color: var(--accent);
  }
  .primary {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
    font-weight: 600;
  }
  .file input {
    display: none;
  }
  .status {
    min-height: 1.4em;
    margin: 0;
    color: var(--good);
    font-size: 0.9rem;
  }
  .status.failed {
    color: var(--bad);
    font-weight: 600;
  }
</style>
