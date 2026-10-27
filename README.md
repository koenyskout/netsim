# NetSim

A visual, step-by-step network simulator for an introductory networking course. It covers MAC addresses, IP addresses, ports, switches, ARP, routing and NAT, plus basic DHCP and DNS.

Students set up hosts (IP, mask, gateway), send a message and watch it travel hop by hop, layer by layer. At the end they see **whether it arrived, and why or why not**. It is built for lectures on a projector first; students can play with it afterwards.

## Features

- **Guided tour**: numbered scenarios, from two PCs on one switch to a home network behind NAT.
- **Fix the network**: broken networks to troubleshoot (wrong mask, missing gateway, missing route, …).
- **Step through every run**, forwards and backwards. Each step has a plain-language caption.
- **The four layers** (Application, Transport, Network, Link) are shown as nested envelopes. The Packet and Layers panels show what each header contains.
- **Build your own network**: add devices and cables in Edit mode, and click a device to configure it.
- **Share links**: `#nat` opens a built-in scenario; **Share** creates a link or a file for any network, including your own.
- **Present mode** (P) for large text at the back of the room.

Keyboard: ← / → (or Space, Page Up / Down for presenter clickers) step, Shift+← / → jump a hop, Home restart, P present, I side panel.

## Running it

Requires Node 22 or later.

```
npm install
npm run dev     # local dev server
npm test        # engine and scenario tests
npm run check   # Svelte and TypeScript checks
npm run build   # static site in dist/
```

The result is a static site with no backend. `.github/workflows/deploy.yml` builds and deploys it to GitHub Pages on every push to `main`. For that, set the repository's Pages source to "GitHub Actions".

## Adding a scenario

Each scenario is a JSON file in [`src/examples/`](src/examples/README.md). The file name is the short link. No code changes are needed.

## Design

[PLAN.md](PLAN.md) records the scope, the teaching goals and the design decisions.

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md). You can use, change and share NetSim for any noncommercial purpose, including teaching at schools and universities. You may not sell it or anything derived from it.
