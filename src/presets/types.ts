import type { Action, DropReason, Topology } from '../engine/model';

export interface Suggestion {
  label: string;
  action: Action;
  /** What should happen with the preset as shipped (checked by the tests). */
  expect: { delivered: boolean; reason?: DropReason; device?: string; replyDelivered?: boolean };
}

/** A ready-made network with a learning goal. */
export interface Preset {
  id: string;
  /** 'tour' scenarios teach a concept; 'fix' are broken on purpose; 'example' are extra ones; 'sandbox' is the student's own network. */
  group: 'tour' | 'fix' | 'example' | 'sandbox';
  title: string;
  /** One or two sentences shown above the canvas. */
  description: string;
  /** What the student should notice. */
  goal: string;
  topology: Topology;
  /** Centre of each device on the 1200x640 stage. */
  positions: Record<string, { x: number; y: number }>;
  suggestions: Suggestion[];
  /** Hide configuration hints until asked, so the student has to find the problem. */
  hideHints?: boolean;
}

export const STAGE = { width: 1200, height: 640 } as const;
