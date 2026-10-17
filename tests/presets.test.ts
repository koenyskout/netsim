import { describe, expect, it } from 'vitest';
import { presets } from '../src/presets';
import { simulate } from '../src/engine/simulate';

describe('presets', () => {
  for (const preset of presets) {
    describe(preset.title, () => {
      it('has a position for every device', () => {
        for (const id of Object.keys(preset.topology.devices)) {
          expect(preset.positions[id], id).toBeDefined();
        }
      });

      for (const s of preset.suggestions) {
        it(`"${s.label}" behaves as documented`, () => {
          const { outcome } = simulate(preset.topology, s.action);
          expect(outcome.delivered).toBe(s.expect.delivered);
          if (s.expect.reason) expect(outcome.reason).toBe(s.expect.reason);
          if (s.expect.device) expect(outcome.device).toBe(s.expect.device);
          if (s.expect.replyDelivered !== undefined) expect(outcome.replyDelivered).toBe(s.expect.replyDelivered);
        });
      }
    });
  }
});
