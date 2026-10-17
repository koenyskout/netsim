import type { SimResult } from './events';
import type { SimEvent } from './events';
import type { MacEntry, NatEntry } from './model';

/**
 * A cursor over the events of one simulation run. `position` is the number of
 * events already shown (0 = nothing yet). Stepping backward just moves the cursor.
 */
export class Timeline {
  readonly events: readonly SimEvent[];
  private readonly initialMacTables: Record<string, MacEntry[]>;
  private readonly initialNatTables: Record<string, NatEntry[]>;
  position = 0;

  constructor(result: Pick<SimResult, 'events' | 'initialMacTables' | 'initialNatTables'>) {
    this.events = result.events;
    this.initialMacTables = result.initialMacTables;
    this.initialNatTables = result.initialNatTables;
  }

  get length(): number {
    return this.events.length;
  }
  get atStart(): boolean {
    return this.position === 0;
  }
  get atEnd(): boolean {
    return this.position === this.events.length;
  }
  /** The most recently shown event, or null at the start. */
  get current(): SimEvent | null {
    return this.position === 0 ? null : this.events[this.position - 1];
  }

  seek(position: number): void {
    this.position = Math.max(0, Math.min(this.events.length, Math.trunc(position)));
  }
  next(): boolean {
    if (this.atEnd) return false;
    this.position++;
    return true;
  }
  prev(): boolean {
    if (this.atStart) return false;
    this.position--;
    return true;
  }

  /** Jump to just after the next 'transmit' event (one hop), or to the end. */
  nextHop(): void {
    const i = this.events.findIndex((e, idx) => idx >= this.position && e.kind === 'transmit');
    this.position = i === -1 ? this.events.length : i + 1;
  }

  /** Jump back to just after the previous 'transmit' event, or to the start. */
  prevHop(): void {
    for (let i = this.position - 2; i >= 0; i--) {
      if (this.events[i].kind === 'transmit') {
        this.position = i + 1;
        return;
      }
    }
    this.position = 0;
  }

  /** The switch MAC tables as they were at the current position. */
  macTables(): Record<string, MacEntry[]> {
    const tables = structuredClone(this.initialMacTables);
    for (let i = 0; i < this.position; i++) {
      const e = this.events[i];
      if (e.kind === 'learn') tables[e.device] = structuredClone(e.macTable);
    }
    return tables;
  }

  /** The NAT tables as they were at the current position. */
  natTables(): Record<string, NatEntry[]> {
    const tables = structuredClone(this.initialNatTables);
    for (let i = 0; i < this.position; i++) {
      const e = this.events[i];
      if (e.kind === 'nat') tables[e.device] = structuredClone(e.natTable);
    }
    return tables;
  }
}
