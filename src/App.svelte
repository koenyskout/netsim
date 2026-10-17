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
  let panelOpen = $state(true);
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
    if (player.result) return 'Press ▶ to watch the message travel, or step through it with the arrow keys.';
    return 'Pick a message below to send it.';
  });

  function onkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.matches('input, select, textarea')) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      e.shiftKey ? player.nextHop() : player.next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      e.shiftKey ? player.prevHop() : player.prev();
    } else if (e.key === ' ' && !t.matches('button')) {
      e.preventDefault();
      player.toggle();
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
        {#each fix as p (p.id)}<option value={p.id}>{p.title.replace(/^Fix: /, '')}</option>{/each}
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
      <p class="caption" aria-live="polite">{caption}</p>
      <Stage {player} />
      <div class="outcome-over"><Outcome {player} /></div>
      {#if player.editMode}<EditBar {player} />{/if}
      {#if !panelOpen}
        <button class="reopen" onclick={() => (panelOpen = true)} title="Show the side panel (I)">◂ Panel</button>
      {/if}
    </div>
    {#if panelOpen}
      <Aside {player} onclose={() => (panelOpen = false)} />
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
    background: color-mix(in srgb, var(--accent) 7%, var(--panel));
    border-bottom: 1px solid var(--line);
  }
  .outcome-over {
    position: absolute;
    left: 1rem;
    right: 1rem;
    bottom: 0.8rem;
    z-index: 4;
    pointer-events: none;
  }
  .reopen {
    position: absolute;
    top: 4rem;
    right: 0.5rem;
    padding: 0.3rem 0.7rem;
    border: 2px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    cursor: pointer;
    z-index: 5;
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
