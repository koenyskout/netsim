# Notes for agents

NetSim is a teaching tool for an **introductory** networking course. It is used mainly on a projector during lectures. Read [PLAN.md](PLAN.md) for the scope and design decisions before changing behaviour.

## Ground rules

- **Clarity beats protocol fidelity.** Every feature must serve one of the concepts in PLAN.md: MAC, IP, ports, switches, routing, NAT, and optionally DHCP and DNS. TCP details, ICMP, TTL, VLANs and IPv6 are out of scope on purpose. ARP is hidden.
- **The projector is the main screen.** Check layout changes at 1280×800. Text on the stage must stay readable from the back of a room, and the network picture gets as much space as possible.
- **English only**, in plain language for beginners. Captions explain *why*, not just *what*.
- **No backend.** This is a static site deployed to GitHub Pages, with a relative `base` in `vite.config.ts`.

## Architecture

```
src/engine/    pure TypeScript, no Svelte, no DOM
src/presets/   loads and validates the scenario files
src/examples/  the scenarios, one JSON file each (see its README)
src/ui/        Svelte 5 components (runes) and the reactive Player
tests/         Vitest, engine and scenarios only
```

- **`simulate(topology, action)` is a pure function.** It returns a `SimResult`: a list of events and the topology with its learned state (MAC tables, NAT table, DHCP leases). It never mutates its input.
- **The UI replays the events.** `Player` (`src/ui/player.svelte.ts`) holds a cursor `position` into the event list, so stepping backwards is just moving the cursor. `sceneAt(events, position)` (`src/ui/scene.ts`) derives what is on screen. Timeline-dependent state, such as the MAC and NAT tables at a given step, comes from `Timeline` (`src/engine/timeline.ts`).
- **Captions and drop reasons** are in `src/engine/explain.ts`. When you add a new way for a packet to be dropped, add an explanation for it there.
- **Scenarios are data.** Each one is scene JSON (`format: "netsim/1"`) plus a `scenario` block. The file name is the id and the short link (`#name`). The `expect` field of each suggestion is checked by `tests/presets.test.ts`.
- **Sharing** lives in `src/engine/share.ts`. `#name` opens a scenario; `#s=<base64url>` carries a whole scene. Learned state is stripped on export.
- **Colours** are CSS variables in `src/app.css`. There is one colour per layer (`--c-app`, `--c-transport`, `--c-network`, `--c-link`), and the address colours are in `src/ui/colors.ts`. Keep them consistent: a layer's colour means the same thing everywhere.

## Working here

- Before you call something done, run `npm run check`, `npm test` and `npm run build`. All three must pass.
- Put engine behaviour under test in `tests/`. UI changes are checked visually: run `npm run dev` and take screenshots at 1280×800.
- Match the existing style: small functions, short doc comments that explain intent, and no comments that repeat the code.
- Commit each finished piece of work as its own small, focused commit. Do **not** push or deploy unless the maintainer asks.
- To try out alternative UI designs, put each one on its own branch so it is easy to revert.

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md). Do not add dependencies whose licenses conflict with this, and keep the `Required Notice` line in `LICENSE.md`.
