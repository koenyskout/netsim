<script lang="ts">
  import { hueOf, shortMac } from './colors';

  let {
    kind,
    value,
    short = false,
    ghost = false,
    changed = false,
  }: {
    kind: 'mac' | 'ip' | 'port';
    value: string | number;
    short?: boolean;
    /** Old value that has been replaced: struck through and faded. */
    ghost?: boolean;
    /** New value that just replaced an old one. */
    changed?: boolean;
  } = $props();

  const text = $derived(kind === 'mac' && short ? shortMac(String(value)) : String(value));
  const hue = $derived(hueOf(String(value)));
</script>

<span class="chip {kind}" class:ghost class:changed style="--h:{hue}" title={kind.toUpperCase() + ' ' + value}>
  {text}
</span>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    padding: 0.12em 0.6em 0.12em 0.5em;
    font-family: var(--mono);
    font-size: 0.92em;
    line-height: 1.3;
    white-space: nowrap;
    background: hsl(var(--h) 85% 91%);
    border: 2px solid hsl(var(--h) 55% 45%);
    color: hsl(var(--h) 65% 20%);
    border-radius: 6px;
  }
  /* Different shape per kind so addresses are not told apart by colour alone. */
  .chip::before {
    content: '';
    width: 0.62em;
    height: 0.62em;
    background: hsl(var(--h) 55% 40%);
    flex: none;
  }
  .mac::before {
    border-radius: 1px;
  }
  .ip {
    border-radius: 999px;
  }
  .ip::before {
    border-radius: 50%;
  }
  .port::before {
    transform: rotate(45deg) scale(0.85);
  }
  .ghost {
    opacity: 0.55;
    text-decoration: line-through;
  }
  .changed {
    animation: pop 0.7s ease-out;
    box-shadow: 0 0 0 3px hsl(var(--h) 90% 70% / 0.7);
  }
  @keyframes pop {
    from {
      transform: scale(1.35);
    }
    to {
      transform: scale(1);
    }
  }
</style>
