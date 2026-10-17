import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Relative base so the site works on any GitHub Pages path.
export default defineConfig({
  base: './',
  plugins: [svelte()],
  test: { include: ['tests/**/*.test.ts'] },
});
