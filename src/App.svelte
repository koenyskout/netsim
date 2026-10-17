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
    return 'Pick a message below and press Send.';
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
    <nav aria-label="Scenarios">
      {#each tour as p (p.id)}
        <button class:active={player.preset.id === p.id} onclick={() => player.loadPreset(p)}>{p.title}</button>
      {/each}
      <select
        class:active={player.preset.group === 'fix'}
        aria-label="Troubleshooting scenarios"
        value={player.preset.group === 'fix' ? player.preset.id : ''}
        onchange={(e) => {
          const p = presets.find((x) => x.id === e.currentTarget.value);
          if (p) player.loadPreset(p);
        }}
      >
        <option value="" disabled>Fix the network…</option>
        {#each fix as p (p.id)}<option value={p.id}>{p.title}</option>{/each}
      </select>
      {#if more.length > 0}
        <select
          class:active={player.preset.group === 'example'}
          aria-label="More examples"
          value={player.preset.group === 'example' ? player.preset.id : ''}
          onchange={(e) => {
            const p = presets.find((x) => x.id === e.currentTarget.value);
            if (p) player.loadPreset(p);
          }}
        >
          <option value="" disabled>Examples…</option>
          {#each more as p (p.id)}<option value={p.id}>{p.title}</option>{/each}
        </select>
      {/if}
      <button class:active={player.preset.group === 'sandbox'} onclick={openSandbox}>Sandbox</button>
    </nav>
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
      <p><strong>{player.preset.description}</strong></p>
      <p class="goal">{player.preset.goal}</p>
    </section>
  {/if}

  <main>
    <div class="stage-wrap">
      <Stage {player} />
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
    <p class="caption" aria-live="polite">{caption}</p>
    <div class="outcome-slot"><Outcome {player} /></div>
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
    gap: 1.5rem;
    padding: 0.6rem 1.2rem;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
    flex-wrap: wrap;
  }
  h1 {
    margin: 0;
    font-size: 1.3rem;
  }
  nav {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  nav button {
    padding: 0.35rem 0.8rem;
    border: 2px solid var(--line);
    border-radius: 999px;
    background: var(--panel);
    cursor: pointer;
  }
  nav button:hover {
    border-color: var(--accent);
  }
  .right {
    margin-left: auto;
    display: flex;
    gap: 0.5rem;
  }
  .problem {
    margin: 0;
    padding: 0.4rem 1.2rem;
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
  }
  .toggle[aria-pressed='true'] {
    border-color: var(--accent);
    color: var(--accent);
  }
  .stage-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    position: relative;
  }
  .reopen {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    padding: 0.3rem 0.7rem;
    border: 2px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    cursor: pointer;
    z-index: 5;
  }
  nav select {
    padding: 0.35rem 0.8rem;
    border: 2px solid var(--line);
    border-radius: 999px;
    background: var(--panel);
    cursor: pointer;
  }
  nav .active {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
  }
  .intro {
    padding: 0.6rem 1.2rem 0;
  }
  .intro p {
    margin: 0 0 0.2rem;
  }
  .goal {
    color: var(--muted);
  }
  main {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  footer {
    padding: 0.7rem 1.2rem 0.9rem;
    background: var(--panel);
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  /* Reserve the space so the picture does not jump when the result appears. */
  .outcome-slot {
    min-height: 3.6rem;
  }
  .caption {
    margin: 0;
    font-size: clamp(1.1rem, 2.4vh, 1.45rem);
    line-height: 1.35;
    min-height: 2.7em;
  }
  /* Lecture mode: bigger text for the back of the room. */
  .present .caption {
    font-size: clamp(1.4rem, 3.4vh, 2rem);
  }
  .present header {
    padding-block: 0.3rem;
  }
</style>
