# NetSim: plan

A visual, step-by-step network simulator for an introductory networking course. Mainly for lecture illustration; students can play with it afterwards.

## Goals and scope

**Concepts covered** (one core idea each):

| Topic | The one idea | What the student sees |
|---|---|---|
| MAC | Identifies a device on the *local* link; changes at every hop | MAC chips flip at each router |
| IP | Identifies a device across networks; stays end to end | IP chips stay while MACs change |
| Ports | Direct a packet to the right *application* on a host | Packet drops into the app that opened the port |
| Switch | Learns which MAC is behind which port; floods when unsure | MAC table fills in; flood is visible |
| Hub (contrast) | Repeats every frame out of all other ports; never learns | Everyone receives everything; compare with the switch |
| ARP | Finds the MAC address for an IP on the local network | Broadcast question, direct answer, ARP table fills in |
| Router | Picks the next hop by destination network | Matching route row lights up |
| NAT | Many private devices share one public address; ports tell them apart | Source IP/port rewritten; table row links the reply back |
| DHCP (optional) | A new device asks the network for its settings | Host config fills in |
| DNS (optional) | Looks up the IP that belongs to a name | Name chip becomes an IP chip |

**Layering** is the organising visual idea. Four layers: **Application, Transport, Network, Link** (physical = "the cable").

**Out of scope**: TCP details (handshake, flags, state), ICMP (ping/traceroute), TTL, VLANs, IPv6, dynamic routing, lease timers, DNS hierarchy/record types. If a feature does not serve a concept above, it is cut. Clarity beats protocol fidelity.

**Must-have**: students configure their own IP, mask, gateway; send a packet; see how it travels and **whether and why it arrives**. Predefined configurations (presets). Step forward and backward.

## Decisions

- English only (keep strings in one place anyway).
- TypeScript + Vite static site, no backend. UI tech free (leaning Svelte; plain TS also fine).
- Deployed to GitHub Pages via GitHub Actions (user has a GitHub organisation).
- No recording of student results; forward/backward stepping replaces it.
- ARP is shown: a broadcast question ("Who has 10.0.0.1?"), a direct answer, and ARP tables on hosts and routers that persist between runs like MAC tables. The waiting message steps aside until the answer arrives. (Originally planned as hidden; shown since it answers "how does the router know the next MAC?") The "Show ARP" button in the header turns it off: devices then just find the next MAC in one step and ARP tables stay hidden, for lessons that are not about ARP yet. The choice is remembered per browser.
- DHCP simplified to two steps (ask by broadcast, get settings). Router doubles as DHCP server by default.
- DNS: single flat server with a name table and a client cache.
- Subnet masks shown with a plain network label plus CIDR; accept dotted-decimal or CIDR input.
- Layer view is an add-on after the network view works.
- Predict-first questions in guided scenarios ("Which MAC will the next packet carry?").

## Visual design

### Packet as nested envelopes
Packet card is nested boxes, one colour band and label per layer:
Link (MAC src/dst) > Network (IP src/dst) > Transport (ports) > Application (message).
- Sending: envelopes close around the message (wrap). Arriving: peeled in reverse (unwrap).
- **A device opens only as many layers as its role needs**: hub and switch = link only; router = link + network (rebuilds link envelope for next hop); NAT = also transport (rewrites port); host = all.
- Addresses are colour-coded chips with short labels/shapes (not colour alone). Changes animate: MAC chips swap at routers, source IP/port morph at NAT with a glowing link to the NAT-table row, name dissolves into IP at DNS. Ghost of "before" fades next to "after".
- Compact mode while moving (chips only); full card on pause/hover.

### Devices
- Each device shows a small layer-stack icon with the layers it implements highlighted. During a step, the packet rises to the layer doing the work, then back down.
- Host: IP, MAC, gateway, list of apps with open ports. Packet drops into matching app or bounces off a closed port.
- Switch: MAC table panel; row "writes in"; known destination lights one port, unknown floods all others.
- Router: routing table; matching row highlights; outgoing interface lights.
- NAT router: inside/outside zones shaded; NAT table rows, port-forward rules as static rows; unsolicited inbound dropped with "no mapping".
- DHCP/DNS are ordinary apps on ports (UDP 67/68, 53), with a small type badge on their packets.

### Layer view (add-on)
Toggle: sender and receiver as stacks side by side, intermediate devices as shorter stacks, peer layers linked by dotted lines. Driven by the same events as the network view.

### UI layout
- Centre: topology canvas. Bottom: step bar (back, forward, jump a hop, scrubber with event ticks; no autoplay: the lecturer sets the pace) and a large caption line.
- Right: inspector (packet envelope or device config/tables). Left: device palette (edit mode) and preset picker.
- **Lecture mode**: larger text/chips, hide editing chrome, high contrast.
- Keyboard: arrows, Space and Page Up/Down (presenter clickers) step.

## Engine

**Engine is a pure function: (topology, action) -> events.** Precomputed and deterministic; UI only replays with a cursor.

Events: packet created, layer added, travels on link, layer opened, table lookup, header rewritten, delivered / dropped(reason). Each carries a plain-language caption and a snapshot of relevant tables, so scrubbing back shows tables as they were. Forward/backward = moving the cursor.

Packets are layered objects (array of headers + payload). Each device declares the highest layer it processes.

### Configuration
Per interface: IP, mask (CIDR or dotted). Host: default gateway, apps/open ports, optional DNS server / use DHCP. Router: per-interface addresses, editable routing table, NAT toggle with inside/outside interfaces and port-forward rules. Switch and hub: nothing. Inline friendly warnings (never blocking) so students can build broken networks.

### Delivery outcome
Every run ends with a banner: delivered to *app X on host Y*, or not delivered *because...* Dropped packets stop visibly at the failing device with a red marker.

| Drop reason | Explanation |
|---|---|
| Other network, no gateway set | Host does not know where to send packets for other networks |
| Gateway not on my network | Gateway address not directly reachable |
| No route at router | Router has no route for that destination network |
| Port closed | Packet arrived, but no app listens on that port |
| Wrong subnet/mask | Sender thinks destination is local (or remote) but it is not |
| Duplicate IP (optional) | Two devices claim the address |
| NAT: no mapping for inbound | Router does not know which inside host the reply belongs to |
| DNS: name not found (optional) | Name has no record |
| No link | Interface not connected |

## Presets (JSON in repo)

Each has title, description, learning goal, suggested actions.

**Guided tour**: 1 Wrapping a message (one host, layers) - 2 Same switch (MAC learning, flooding) - 3 Apps and ports - 4 Two networks and a router - 5 Home network with NAT and port forwarding.
**Optional services**: 6 DNS - 7 DHCP - 8 Everything together (DHCP, DNS, NAT).
**Troubleshooting** (broken on purpose): wrong mask, missing/wrong gateway, missing route, closed port, NAT without port-forward rule.
**Sandbox**: empty canvas, one switch with N hosts, home network starter.

Export/import topology as JSON and share via URL hash.

## Repository layout

```
netsim/
├─ .github/workflows/deploy.yml
├─ index.html
├─ vite.config.ts                  # relative base so repo name does not matter
├─ src/
│  ├─ engine/                      # pure TS, no DOM
│  │  ├─ model.ts                  # devices, interfaces, links, packet/layer types
│  │  ├─ addressing.ts             # IP/mask/CIDR helpers
│  │  ├─ simulate.ts               # (topology, action) -> events
│  │  ├─ devices/{host,switch,router}.ts
│  │  ├─ services/{dhcp,dns}.ts
│  │  ├─ explain.ts                # event/drop reason -> caption
│  │  └─ validate.ts               # friendly config warnings
│  ├─ ui/
│  │  ├─ canvas/                   # SVG topology, packet card, animation
│  │  ├─ panels/                   # inspector, config forms, preset picker
│  │  ├─ timeline.ts               # cursor and scrubber
│  │  └─ layerview/                # add-on
│  ├─ presets/*.json
│  └─ main.ts
├─ tests/                          # Vitest, engine only; one test per preset with expected outcome
└─ package.json
```

## GitHub Actions / deployment

`deploy.yml`: on push to `main` (and manual): checkout, setup Node, `npm ci`, `npm test`, `npm run build`, `actions/upload-pages-artifact`, `actions/deploy-pages`. Permissions `pages: write`, `id-token: write`. Repo setting: Pages source = GitHub Actions. Needs `git init`, `.gitignore`, README with live link, and a repo created in the user's GitHub organisation.

## Phases

1. **Scaffold**: Vite, TypeScript, Vitest, GH Actions deploy, hello-world live on Pages (proves the pipeline).
2. **Engine core**: addressing helpers, layered packet model, events/timeline, tests.
3. **Canvas**: hosts + switch, nested packet card with wrap/unwrap, playback bar with back/forward (presets 1-2).
4. **Ports and apps**, device layer stacks (preset 3).
5. **Router + config panel**: IP/mask/gateway editing, drop reasons, result banner (preset 4 + troubleshooting presets). *Delivers the must-have.*
6. **NAT** and port forwarding (preset 5).
7. **Editor and sharing**: palette, link drawing, JSON import/export, URL hash.
8. **DNS and DHCP** (optional services, presets 6-8).
9. **Layer view** add-on.
10. **Polish**: lecture mode, accessibility (colour-blind-safe, labels/shapes), mobile.

Phases 1-5 are already usable in a lecture.

### Progress
- Phases 1 (scaffold, GH Actions written but not pushed), 2, 3, 4 and 5 are done locally.
- Phase 5 added: device settings panel (click a device), routing table on routers, friendly hints (hidden in "Fix the network" scenarios until asked), 6 troubleshooting presets, and a Present mode (hides intro/form) plus a collapsible side panel for small projectors.
- Device cards now contain the layer stack (172x84), so nothing sticks out of the stage.
- Phase 6 done: NAT router (source IP+port rewrite, persistent NAT table, port forwarding, `no-mapping` drop), preset 5 and a NAT fix scenario, NAT settings in the device panel.
- Phase 7 done (code, tests, build; browser check pending): sandbox editor (add/remove devices, cables, drag), share link/JSON/file.
- Phases 7-8 done and browser-checked: DNS (names in the To field) and DHCP (broadcast, lease, host configures itself).
- Phase 9 done: Layers tab in the side panel (one column per device, four layer cells lit as the message moves).
- Phase 10 (partly): bigger captions in Present mode, slightly faster default playback. Dark mode deliberately cut (projectors prefer light; many fixed colours). Still open: colour-blind audit, predict-first questions, cursor-aware host config display.
- Presets and examples are one thing: every file in `src/examples/*.json` is a scenario (network + a `scenario` block with texts and suggested messages; see its README). The file name is the short link (`#nat`). Groups: tour (numbered buttons), fix (troubleshooting menu), example (Examples menu).
- Not pushed to GitHub yet; waiting for organisation and repo name.

## Open items
- Name of the GitHub organisation and repo (needed at phase 1).
- UI tech: Svelte vs plain TS (not critical; decide at phase 1).
