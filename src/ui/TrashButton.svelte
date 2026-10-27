<script lang="ts">
  /** A red trash-can button for deleting things. */
  let { onclick, label, disabled = false }: { onclick: () => void; label: string; disabled?: boolean } = $props();
</script>

<button class="trash" {onclick} {disabled} aria-label={label} title={label}>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</button>

<style>
  .trash {
    display: inline-grid;
    place-items: center;
    width: 2.2rem;
    height: 2.2rem;
    padding: 0;
    border: 2px solid color-mix(in srgb, var(--bad) 35%, white);
    border-radius: 8px;
    background: var(--panel);
    color: var(--bad);
    cursor: pointer;
  }
  .trash:hover:not(:disabled) {
    background: color-mix(in srgb, var(--bad) 10%, white);
    border-color: var(--bad);
  }
  .trash:disabled {
    opacity: 0.4;
    cursor: default;
  }
  svg {
    width: 1.3rem;
    height: 1.3rem;
  }
</style>
