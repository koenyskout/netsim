import { parseScene } from '../engine/share';
import type { Preset, Suggestion } from './types';

/**
 * Every file in src/examples/ is one scenario: a network (as exported by Share → Download file)
 * plus a "scenario" block with the texts and suggested messages. The file name is the short link (#name).
 * See src/examples/README.md.
 */
const files = import.meta.glob('../examples/*.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

const GROUPS = ['tour', 'fix', 'example'] as const;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function load(path: string, text: string): { preset: Preset; order: number } {
  const id = path.replace(/^.*\//, '').replace(/\.json$/, '');
  const bad = (why: string): never => {
    throw new Error(`Example ${id}: ${why}`);
  };
  const parsed = parseScene(text);
  if (!parsed.ok) return bad(parsed.error);
  const s = (JSON.parse(text) as { scenario?: unknown }).scenario;
  if (!isObj(s)) return bad('the "scenario" block is missing.');
  if (typeof s.title !== 'string' || typeof s.description !== 'string') return bad('the scenario needs a title and a description.');
  const group = s.group ?? 'example';
  if (!GROUPS.includes(group as (typeof GROUPS)[number])) return bad(`group must be one of ${GROUPS.join(', ')}.`);
  const suggestions = (s.suggestions ?? []) as Suggestion[];
  if (!Array.isArray(suggestions)) return bad('suggestions must be a list.');
  for (const x of suggestions) {
    if (!isObj(x) || typeof x.label !== 'string' || !isObj(x.action)) return bad('every suggestion needs a label and an action.');
    const from = (x.action as { from?: unknown }).from;
    if (typeof from !== 'string' || !(from in parsed.scene.topology.devices)) return bad(`suggestion "${x.label}" starts at an unknown device.`);
  }
  return {
    order: typeof s.order === 'number' ? s.order : 1000,
    preset: {
      id,
      group: group as Preset['group'],
      title: s.title,
      description: s.description,
      goal: typeof s.goal === 'string' ? s.goal : '',
      topology: parsed.scene.topology,
      positions: parsed.scene.positions,
      suggestions,
      hideHints: s.hideHints === true,
    },
  };
}

export const presets: Preset[] = Object.entries(files)
  .map(([path, text]) => load(path, text))
  .sort((a, b) => a.order - b.order || a.preset.id.localeCompare(b.preset.id))
  .map((x) => x.preset);
