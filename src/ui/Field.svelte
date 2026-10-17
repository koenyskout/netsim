<script lang="ts">
  import { untrack } from 'svelte';

  /**
   * A text field that applies its value as soon as it is valid.
   * `parse` returns the cleaned-up value, or a string starting with "!" for an error message.
   */
  let {
    label,
    value,
    parse,
    onchange,
    placeholder = '',
    size = 14,
    hint = '',
  }: {
    label: string;
    /** Current value shown in the field. */
    value: string;
    parse: (text: string) => { ok: true; value: string | undefined } | { ok: false; error: string };
    onchange: (value: string | undefined) => void;
    placeholder?: string;
    size?: number;
    hint?: string;
  } = $props();

  // The text is the student's own while typing; it only follows `value` when the form is rebuilt.
  let text = $state(untrack(() => value));
  const result = $derived(parse(text));
</script>

<label>
  <span class="name">{label}</span>
  <input
    bind:value={text}
    {size}
    {placeholder}
    class:bad={!result.ok}
    aria-invalid={!result.ok}
    oninput={() => {
      const r = parse(text);
      if (r.ok) onchange(r.value);
    }}
  />
  {#if !result.ok}
    <span class="error">{result.error}</span>
  {:else if hint}
    <span class="hint">{hint}</span>
  {/if}
</label>

<style>
  label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .name {
    font-size: 0.8rem;
    color: var(--muted);
  }
  input {
    padding: 0.35rem 0.5rem;
    border: 2px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    font-family: var(--mono);
    font-size: 0.95rem;
    min-width: 0;
  }
  input.bad {
    border-color: var(--bad);
  }
  .error {
    font-size: 0.78rem;
    color: var(--bad);
  }
  .hint {
    font-size: 0.78rem;
    color: var(--muted);
  }
</style>
