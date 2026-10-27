<script lang="ts">
  import { presets } from './presets';
  import Aside from './ui/Aside.svelte';
  import Outcome from './ui/Outcome.svelte';
  import PlaybackBar from './ui/PlaybackBar.svelte';
  import { Player } from './ui/player.svelte';
  import SendPanel from './ui/SendPanel.svelte';
  import Stage from './ui/Stage.svelte';

  import EditBar from './ui/EditBar.svelte';
  import ShareDialog from './ui/ShareDialog.svelte';
  import { decodeHash, shortName } from './engine/share';
  import { starterScene } from './presets/sandbox';

  const player = new Player(presets[0]);
  let present = $state(false);
  // The side panel floats over the picture and starts closed, so the network gets the full width.
  let panelOpen = $state(false);
  $effect(() => {
    if (player.selected) panelOpen = true;
  });
  function openTab(tab: 'packet' | 'layers' | 'device') {
    player.tab = tab;
    panelOpen = true;
  }
  let sharing = $state(false);
  let linkProblem = $state('');
  const tour = presets.filter((p) => p.group === 'tour');
  const fix = presets.filter((p) => p.group === 'fix');
  const more = presets.filter((p) => p.group === 'example');
  const nextTour = $derived(tour[tour.findIndex((p) => p.id === player.preset.id) + 1] ?? null);

  /** `#name` opens the scenario with that name (the file name in src/examples). */
  function openByName(name: string) {
    const known = presets.find((p) => p.id === name);
    if (known) {
      player.loadPreset(known);
      linkProblem = '';
    } else {
      linkProblem = `There is no example called "${name}".`;
    }
  }

  function fromHash() {
    const name = shortName(location.hash);
    if (name) {
      openByName(name);
      return;
    }
    const r = decodeHash(location.hash);
    if (!r) return;
    if (r.ok) {
      player.loadScene(r.scene, 'Shared network');
      linkProblem = '';
    } else {
      linkProblem = r.error;
    }
  }
  fromHash();

  function openSandbox() {
    const s = starterScene();
    player.loadScene(s);
    player.setEditMode(true);
  }

  const caption = $derived.by(() => {
    if (player.scene.event) return player.scene.event.caption;
    if (player.result) return 'Press ▶ (or →) to take the first step.';
    return 'Pick a message below to send it.';
  });

  function onkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.matches('input, select, textarea')) return;
    // Page Down / Page Up are what presenter clickers send.
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !t.matches('button'))) {
      e.preventDefault();
      e.shiftKey ? player.nextHop() : player.next();
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      e.shiftKey ? player.prevHop() : player.prev();
    } else if (e.key === 'Home') {
      player.restart();
    } else if (e.key === 'p' || e.key === 'P') {
      present = !present;
    } else if (e.key === 'i' || e.key === 'I') {
      panelOpen = !panelOpen;
    }
  }
</script>

<svelte:window {onkeydown} onhashchange={fromHash} />

<div class="app" class:present>
  <header>
    <h1>NetSim</h1>
    <select
      class="scenario"
      aria-label="Scenario"
      value={player.preset.group === 'sandbox' ? '' : player.preset.id}
      onchange={(e) => {
        const v = e.currentTarget.value;
        if (v === '#new') openSandbox();
        else {
          const p = presets.find((x) => x.id === v);
          if (p) player.loadPreset(p);
        }
      }}
    >
      {#if player.preset.group === 'sandbox'}<option value="" disabled>{player.preset.title}</option>{/if}
      <optgroup label="Guided tour">
        {#each tour as p (p.id)}<option value={p.id}>{p.title}</option>{/each}
      </optgroup>
      <optgroup label="Fix the network">
        {#each fix as p (p.id)}<option value={p.id}>{p.title}</option>{/each}
      </optgroup>
      {#if more.length > 0}
        <optgroup label="Examples">
          {#each more as p (p.id)}<option value={p.id}>{p.title}</option>{/each}
        </optgroup>
      {/if}
      <optgroup label="Your own">
        <option value="#new">New network…</option>
      </optgroup>
    </select>
    {#if nextTour}
      <button class="toggle" onclick={() => player.loadPreset(nextTour)} title="Next scenario: {nextTour.title}">Next ›</button>
    {/if}
    <div class="right">
      <button
        class="toggle"
        aria-pressed={player.showArp}
        onclick={() => player.setShowArp(!player.showArp)}
        title="Show how a device finds the MAC address of the next hop (ARP), or skip that step"
      >
        Show ARP
      </button>
      <button class="toggle" aria-pressed={player.editMode} onclick={() => player.setEditMode(!player.editMode)} title="Move devices, add or remove devices and cables">
        Edit
      </button>
      <button class="toggle" onclick={() => (sharing = true)} title="Share this network as a link or file, or load one">Share</button>
      <button class="toggle" aria-pressed={present} onclick={() => (present = !present)} title="Hide the explanation and the form to give the picture more room (P)">
        Present
      </button>
    </div>
  </header>

  {#if linkProblem}
    <p class="problem" role="alert">
      This link could not be opened: {linkProblem}
      <button onclick={() => (linkProblem = '')}>Dismiss</button>
    </p>
  {/if}

  {#if !present}
    <section class="intro">
      <p><strong>{player.preset.description}</strong> <span class="goal">{player.preset.goal}</span></p>
    </section>
  {/if}

  <main>
    <div class="stage-wrap">
      <!-- At the end of a run the result takes the caption's place, so there is one message to read. -->
      <div class="caption" aria-live="polite">
        {#if player.result && player.atEnd}<Outcome {player} />{:else}{caption}{/if}
      </div>
      <div class="picture">
        <Stage {player} />
        {#if player.editMode}<EditBar {player} />{/if}
        {#if !panelOpen}
          <div class="reopen">
            <button onclick={() => openTab('packet')} title="Show what is inside the message (I)">Packet</button>
            <button onclick={() => openTab('layers')} title="Show the four layers">Layers</button>
          </div>
        {/if}
      </div>
    </div>
    {#if panelOpen}
      <Aside
        {player}
        onclose={() => {
          panelOpen = false;
          player.select(null);
        }}
      />
    {/if}
  </main>

  <footer>
    <PlaybackBar {player} />
    <SendPanel {player} compact={present} />
  </footer>
</div>

{#if sharing}
  <ShareDialog {player} onclose={() => (sharing = false)} />
{/if}

<style>
  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.45rem 1rem;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
  }
  h1 {
    margin: 0 0.4rem 0 0;
    font-size: 1.2rem;
  }
  .scenario {
    min-width: 0;
    max-width: 24rem;
    padding: 0.35rem 0.6rem;
    border: 2px solid var(--accent);
    border-radius: 8px;
    background: var(--panel);
    font-weight: 600;
    cursor: pointer;
  }
  .right {
    margin-left: auto;
    display: flex;
    gap: 0.5rem;
  }
  .problem {
    margin: 0;
    padding: 0.4rem 1rem;
    background: #fee2e2;
    color: #7f1d1d;
  }
  .problem button {
    margin-left: 0.6rem;
  }
  .toggle {
    padding: 0.35rem 0.8rem;
    border: 2px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    cursor: pointer;
    white-space: nowrap;
  }
  .toggle[aria-pressed='true'] {
    border-color: var(--accent);
    color: var(--accent);
  }
  .intro {
    padding: 0.45rem 1rem;
    border-bottom: 1px solid var(--line);
  }
  .intro p {
    margin: 0;
    line-height: 1.35;
  }
  .goal {
    color: var(--muted);
  }
  main {
    flex: 1;
    min-height: 0;
    display: flex;
    position: relative;
  }
  .stage-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  /* The caption sits right above the picture, where the eyes already are. */
  .caption {
    margin: 0;
    padding: 0.5rem 1rem;
    font-size: clamp(1.1rem, 2.4vh, 1.45rem);
    line-height: 1.3;
    min-height: 2.9em;
    display: flex;
    flex-direction: column;
    justify-content: center;
    background: color-mix(in srgb, var(--accent) 7%, var(--panel));
    border-bottom: 1px solid var(--line);
  }
  /* Toolbars float over the picture, not over the caption. */
  .picture {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .reopen {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    display: flex;
    gap: 0.4rem;
    z-index: 5;
  }
  .reopen button {
    padding: 0.3rem 0.7rem;
    border: 2px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    cursor: pointer;
  }
  main :global(aside) {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    box-shadow: -8px 0 24px rgb(0 0 0 / 0.12);
  }
  footer {
    padding: 0.5rem 1rem 0.6rem;
    background: var(--panel);
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  /* Lecture mode: bigger text for the back of the room. */
  .present .caption {
    font-size: clamp(1.4rem, 3.4vh, 2rem);
  }
</style>
