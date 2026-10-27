<script lang="ts">
  import { networkLabel, prefixToDotted } from '../engine/addressing';
  import { hasAddresses, type Host, type Router } from '../engine/model';
  import { forwardKey } from '../engine/routes';
  import { routeRows, staticKey } from '../engine/routes';
  import { warningsFor } from '../engine/validate';
  import Chip from './Chip.svelte';
  import Field from './Field.svelte';
  import TrashButton from './TrashButton.svelte';
  import { parseIpField, parseMaskField, parsePortField } from './fields';
  import type { Player } from './player.svelte';

  let { player }: { player: Player } = $props();

  const device = $derived(player.selected ? player.topology.devices[player.selected] : undefined);
  const warnings = $derived(device ? warningsFor(player.topology, device.id) : []);

  const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));

  let newApp = $state('');
  let newPort = $state('');
  let routeNet = $state('');
  let routeMask = $state('24');
  let routeVia = $state('');

  let fwdPublic = $state('');
  let fwdIp = $state('');
  let fwdPort = $state('');
  const fwdOk = $derived(
    parsePortField(fwdPublic).ok && parsePortField(fwdPort).ok && parseIpField(fwdIp).ok && fwdIp.trim() !== '',
  );

  function setNat(on: boolean) {
    if (!device || device.kind !== 'router') return;
    player.edit(device.id, (d) => {
      const r = d as Router;
      if (!on) delete r.nat;
      else r.nat = { outside: r.interfaces[r.interfaces.length - 1].id, forwards: [], table: [] };
    });
  }

  function addForward() {
    if (!device || device.kind !== 'router' || !fwdOk) return;
    const f = { outsidePort: Number(fwdPublic), insideIp: fwdIp.trim(), insidePort: Number(fwdPort) };
    player.edit(device.id, (d) => (d as Router).nat?.forwards.push(f));
    fwdPublic = '';
    fwdIp = '';
    fwdPort = '';
  }

  let dnsName = $state('');
  let dnsIp = $state('');
  const dnsOk = $derived(dnsName.trim() !== '' && parseIpField(dnsIp).ok && dnsIp.trim() !== '');

  function setDns(on: boolean) {
    if (!device || device.kind !== 'host') return;
    player.edit(device.id, (d) => {
      if (on) (d as Host).dnsRecords = [];
      else delete (d as Host).dnsRecords;
    });
  }

  function addDnsRecord() {
    if (!device || device.kind !== 'host' || !dnsOk) return;
    const record = { name: dnsName.trim(), ip: dnsIp.trim() };
    player.edit(device.id, (d) => (d as Host).dnsRecords?.push(record));
    dnsName = '';
    dnsIp = '';
  }

  function setDhcp(on: boolean) {
    if (!device || device.kind !== 'host') return;
    const own = device.interfaces[0];
    player.edit(device.id, (d) => {
      const h = d as Host;
      if (!on) return void delete h.dhcpServer;
      // A sensible pool next to the server's own address.
      const base = own.ip?.split('.').slice(0, 3).join('.') ?? '192.168.1';
      h.dhcpServer = {
        first: `${base}.100`,
        last: `${base}.150`,
        prefix: own.prefix ?? 24,
        ...(h.gateway ? { gateway: h.gateway } : {}),
        leases: [],
      };
    });
  }

  const newPortOk = $derived(parsePortField(newPort).ok);
  const routeOk = $derived(
    parseIpField(routeNet).ok && routeNet.trim() !== '' && parseMaskField(routeMask).ok &&
      routeMask.trim() !== '' && parseIpField(routeVia).ok && routeVia.trim() !== '',
  );

  function addApp() {
    if (!device || device.kind !== 'host' || !newPortOk) return;
    const port = Number(newPort);
    const name = newApp.trim() || `App ${port}`;
    player.edit(device.id, (d) => (d as Host).apps.push({ name, port, reply: 'OK' }));
    newApp = '';
    newPort = '';
  }

  function addRoute() {
    if (!device || device.kind !== 'router' || !routeOk) return;
    const mask = parseMaskField(routeMask);
    if (!mask.ok || mask.value === undefined) return;
    const prefix = Number(mask.value);
    player.edit(device.id, (d) =>
      (d as Router).routes.push({ network: routeNet.trim(), prefix, via: routeVia.trim() }),
    );
    routeNet = '';
    routeVia = '';
  }
</script>

<div class="config">
  {#if !device}
    <p class="hint">Click a device in the picture to see and change its settings.</p>
  {:else}
    {#key `${player.epoch}:${device.id}`}
      <h3>{device.name} <span class="kind">{device.kind === 'host' ? 'computer' : device.kind}</span></h3>

      {#if player.editMode}
        <div class="row">
          <label class="namefield">Name
            <input
              value={device.name}
              maxlength="40"
              onchange={(e) => {
                const name = e.currentTarget.value.trim();
                if (name) player.edit(device.id, (d) => (d.name = name));
                else e.currentTarget.value = device.name;
              }}
            />
          </label>
          <TrashButton label="Delete {device.name}" onclick={() => player.remove(device.id)} />
        </div>
      {/if}

      {#if device.kind === 'hub'}
        <p class="hint">
          A hub has no settings and no IP address. It cannot read MAC addresses either: it repeats every frame out of all
          its other ports, so everyone connected receives everything.
        </p>
      {/if}

      {#if device.kind === 'switch'}
        <p class="hint">
          A switch has no settings and no IP address. It only learns which MAC address is behind which port.
        </p>
        <button onclick={() => player.edit(device.id, (d) => d.kind === 'switch' && (d.macTable = []))}>
          Forget learned addresses
        </button>
      {/if}

      {#if hasAddresses(device)}
        {#each device.interfaces as iface (iface.id)}
          <fieldset>
            <legend>{device.kind === 'router' ? `Interface ${iface.id}` : 'Network settings'}</legend>
            <div class="row">
              <Field
                label="IP address"
                value={iface.ip ?? ''}
                parse={parseIpField}
                onchange={(v) => player.edit(device.id, (d) => (d.interfaces.find((i) => i.id === iface.id)!.ip = v))}
              />
              <Field
                label="Subnet mask"
                value={iface.prefix === undefined ? '' : `/${iface.prefix}`}
                parse={parseMaskField}
                size={8}
                hint={iface.prefix === undefined ? '' : `${prefixToDotted(iface.prefix)}`}
                onchange={(v) => player.edit(device.id, (d) => (d.interfaces.find((i) => i.id === iface.id)!.prefix = num(v)))}
              />
            </div>
            {#if iface.ip && iface.prefix !== undefined}
              <p class="net">Network: <strong>{networkLabel(iface.ip, iface.prefix)}</strong> · Addresses that start the same way are on the same network.</p>
            {/if}
          </fieldset>
        {/each}
      {/if}

      {#if device.kind === 'host'}
        <fieldset>
          <legend>Way out</legend>
          <Field
            label="Default gateway"
            value={device.gateway ?? ''}
            parse={parseIpField}
            hint="The router this computer uses for other networks"
            onchange={(v) => player.edit(device.id, (d) => ((d as Host).gateway = v))}
          />
          <Field
            label="DNS server"
            value={device.dnsServer ?? ''}
            parse={parseIpField}
            hint="Who this computer asks to turn a name into an IP address"
            onchange={(v) => player.edit(device.id, (d) => ((d as Host).dnsServer = v))}
          />
        </fieldset>

        <fieldset>
          <legend>Helps the network (optional)</legend>
          <label class="check">
            <input type="checkbox" checked={device.dnsRecords !== undefined} onchange={(e) => setDns(e.currentTarget.checked)} />
            This computer is a DNS server (port 53)
          </label>
          {#if device.dnsRecords}
            <p class="hint">A DNS server keeps a list of names and the IP addresses they stand for.</p>
            <ul class="routes">
              {#each device.dnsRecords as r, i (`${i}:${r.name}`)}
                <li>
                  <span class="mono">{r.name}</span>
                  <span class="to">→ {r.ip}</span>
                  <button class="x" aria-label="Remove name" title="Remove name" onclick={() => player.edit(device.id, (d) => (d as Host).dnsRecords?.splice(i, 1))}>✕</button>
                </li>
              {:else}
                <li class="hint">The list is empty: every name is unknown.</li>
              {/each}
            </ul>
            <div class="add">
              <input bind:value={dnsName} placeholder="Name" size="14" aria-label="Name" />
              <input bind:value={dnsIp} placeholder="IP address" size="12" aria-label="IP address for the name" class:bad={dnsIp !== '' && !parseIpField(dnsIp).ok} />
              <button disabled={!dnsOk} onclick={addDnsRecord}>Add name</button>
            </div>
          {/if}

          <label class="check">
            <input type="checkbox" checked={device.dhcpServer !== undefined} onchange={(e) => setDhcp(e.currentTarget.checked)} />
            This computer is a DHCP server (port 67)
          </label>
          {#if device.dhcpServer}
            <p class="hint">
              A DHCP server hands out addresses from its pool, so people do not have to type them in.
              It also tells each computer its mask, gateway and DNS server.
            </p>
            <div class="row">
              <Field label="First address" value={device.dhcpServer.first} parse={parseIpField} onchange={(v) => player.edit(device.id, (d) => v && ((d as Host).dhcpServer!.first = v))} />
              <Field label="Last address" value={device.dhcpServer.last} parse={parseIpField} onchange={(v) => player.edit(device.id, (d) => v && ((d as Host).dhcpServer!.last = v))} />
            </div>
            <div class="row">
              <Field label="Subnet mask" size={8} value={`/${device.dhcpServer.prefix}`} parse={parseMaskField} onchange={(v) => player.edit(device.id, (d) => v !== undefined && ((d as Host).dhcpServer!.prefix = Number(v)))} />
              <Field label="Gateway to hand out" value={device.dhcpServer.gateway ?? ''} parse={parseIpField} onchange={(v) => player.edit(device.id, (d) => ((d as Host).dhcpServer!.gateway = v))} />
              <Field label="DNS server to hand out" value={device.dhcpServer.dns ?? ''} parse={parseIpField} onchange={(v) => player.edit(device.id, (d) => ((d as Host).dhcpServer!.dns = v))} />
            </div>
            <button onclick={() => player.edit(device.id, (d) => ((d as Host).dhcpServer!.leases = []))}>Forget handed-out addresses</button>
          {/if}
        </fieldset>

        <fieldset>
          <legend>Applications (open ports)</legend>
          {#each device.apps as app, i (`${i}:${device.apps.length}`)}
            <div class="app-row">
              <span class="app-name">{app.name}</span>
              <Field
                label="Port"
                value={String(app.port)}
                size={6}
                parse={parsePortField}
                onchange={(v) => player.edit(device.id, (d) => ((d as Host).apps[i].port = Number(v)))}
              />
              <button class="x" aria-label="Close this port" title="Close this port" onclick={() => player.edit(device.id, (d) => (d as Host).apps.splice(i, 1))}>✕</button>
            </div>
          {:else}
            <p class="hint">No application is listening, so every port is closed.</p>
          {/each}
          <div class="add">
            <input bind:value={newApp} placeholder="Name" size="10" aria-label="New application name" />
            <input bind:value={newPort} placeholder="Port" size="5" aria-label="New application port" class:bad={newPort !== '' && !newPortOk} />
            <button disabled={!newPortOk} onclick={addApp}>Open port</button>
          </div>
        </fieldset>
      {/if}

      {#if device.kind === 'router'}
        <fieldset>
          <legend>Routing table</legend>
          <p class="hint">Networks the router is connected to are added automatically. For anything else it needs a route.</p>
          <ul class="routes">
            {#each routeRows(device) as row (row.key)}
              <li>
                <span class="mono">{row.network}</span>
                <span class="to">{row.connected ? `connected (${row.iface})` : row.via ? `via ${row.via}` : 'connected'}</span>
                {#if !row.connected}
                  <button
                    class="x"
                    aria-label="Remove route"
                    title="Remove route"
                    onclick={() => player.edit(device.id, (d) => (d as Router).routes.splice((d as Router).routes.findIndex((r) => staticKey(r.network, r.prefix) === row.key), 1))}
                  >✕</button>
                {/if}
              </li>
            {/each}
          </ul>
          <div class="add">
            <input bind:value={routeNet} placeholder="Network" size="12" aria-label="Route network" class:bad={routeNet !== '' && !parseIpField(routeNet).ok} />
            <input bind:value={routeMask} placeholder="Mask" size="5" aria-label="Route mask" class:bad={routeMask !== '' && !parseMaskField(routeMask).ok} />
            <input bind:value={routeVia} placeholder="Next hop" size="12" aria-label="Route next hop" class:bad={routeVia !== '' && !parseIpField(routeVia).ok} />
            <button disabled={!routeOk} onclick={addRoute}>Add route</button>
          </div>
        </fieldset>
      {/if}

      {#if device.kind === 'router'}
        <fieldset>
          <legend>Address translation (NAT)</legend>
          <label class="check">
            <input type="checkbox" checked={device.nat !== undefined} onchange={(e) => setNat(e.currentTarget.checked)} />
            Share one public address with everything inside
          </label>
          {#if device.nat}
            <label class="check">
              Facing the internet:
              <select
                value={device.nat.outside}
                onchange={(e) => player.edit(device.id, (d) => ((d as Router).nat!.outside = e.currentTarget.value))}
              >
                {#each device.interfaces as i (i.id)}<option value={i.id}>{i.id}</option>{/each}
              </select>
            </label>
            <p class="hint">
              Inside devices keep private addresses. When they talk to the internet, the router replaces their
              address and port with its own, and remembers who is who. Anything else coming in from outside is
              dropped, unless a forwarding rule says where it goes.
            </p>
            <strong class="sub">Port forwarding</strong>
            <ul class="routes">
              {#each device.nat.forwards as f, i (forwardKey(f.outsidePort))}
                <li>
                  <span class="mono">public port {f.outsidePort}</span>
                  <span class="to">→ {f.insideIp}:{f.insidePort}</span>
                  <button class="x" aria-label="Remove rule" title="Remove rule" onclick={() => player.edit(device.id, (d) => (d as Router).nat?.forwards.splice(i, 1))}>✕</button>
                </li>
              {:else}
                <li class="hint">No rules: nobody outside can start a conversation with an inside device.</li>
              {/each}
            </ul>
            <div class="add">
              <input bind:value={fwdPublic} placeholder="Public port" size="9" aria-label="Public port" class:bad={fwdPublic !== '' && !parsePortField(fwdPublic).ok} />
              <input bind:value={fwdIp} placeholder="Inside IP" size="12" aria-label="Inside IP address" class:bad={fwdIp !== '' && !parseIpField(fwdIp).ok} />
              <input bind:value={fwdPort} placeholder="Port" size="5" aria-label="Inside port" class:bad={fwdPort !== '' && !parsePortField(fwdPort).ok} />
              <button disabled={!fwdOk} onclick={addForward}>Add rule</button>
            </div>
            <button onclick={() => player.edit(device.id, (d) => ((d as Router).nat!.table = []))}>Forget NAT table</button>
          {/if}
        </fieldset>
      {/if}

      {#if hasAddresses(device) && player.showArp}
        {@const arpRows = player.arpTables[device.id] ?? []}
        <fieldset>
          <legend>ARP table</legend>
          <p class="hint">Which MAC address belongs to which IP address on the local network. Filled in by asking (ARP).</p>
          <ul class="arp-rows">
            {#each arpRows as row (row.ip)}
              <li><Chip kind="ip" value={row.ip} /> <span class="arrow">→</span> <Chip kind="mac" value={row.mac} /></li>
            {:else}
              <li class="hint">Empty: it has not needed anyone's MAC address yet.</li>
            {/each}
          </ul>
          {#if arpRows.length > 0}
            <button onclick={() => player.edit(device.id, (d) => hasAddresses(d) && delete d.arpTable)}>Forget ARP table</button>
          {/if}
        </fieldset>
      {/if}

      {#if hasAddresses(device)}
        {#if player.showHints}
          {#if warnings.length > 0}
            <ul class="warnings" aria-label="Hints">
              {#each warnings as w (w.text)}<li>⚠ {w.text}</li>{/each}
            </ul>
          {:else}
            <p class="ok">✓ Nothing looks wrong with these settings.</p>
          {/if}
        {:else}
          <button onclick={() => (player.showHints = true)}>Show hints</button>
        {/if}
      {/if}
    {/key}
  {/if}
</div>

<style>
  .namefield { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.8rem; color: var(--muted); }
  .namefield input { padding: 0.4rem 0.5rem; border: 2px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--ink); font-size: 1rem; }
  .config {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  h3 {
    margin: 0;
    font-size: 1.1rem;
  }
  .kind {
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--muted);
    margin-left: 0.3rem;
  }
  fieldset {
    border: 2px solid var(--line);
    border-radius: 10px;
    margin: 0;
    padding: 0.4rem 0.7rem 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  legend {
    padding: 0 0.3rem;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .row {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .hint,
  .net {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .net strong {
    font-family: var(--mono);
    color: var(--ink);
  }
  .app-row {
    display: flex;
    align-items: end;
    gap: 0.5rem;
  }
  .app-name {
    flex: 1;
    font-weight: 600;
    padding-bottom: 0.4rem;
  }
  .add {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .add input {
    padding: 0.3rem 0.45rem;
    border: 2px solid var(--line);
    border-radius: 8px;
    font-family: var(--mono);
    min-width: 0;
  }
  .add input.bad {
    border-color: var(--bad);
  }
  button {
    padding: 0.3rem 0.7rem;
    border: 2px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    border-color: var(--accent);
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .x {
    padding: 0.2rem 0.5rem;
    color: var(--muted);
  }
  .routes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .routes li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }
  .sub {
    font-size: 0.85rem;
  }
  select {
    padding: 0.25rem 0.4rem;
    border: 2px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
  }
  .mono {
    font-family: var(--mono);
  }
  .to {
    flex: 1;
    color: var(--muted);
  }
  .warnings {
    list-style: none;
    margin: 0;
    padding: 0.5rem 0.7rem;
    background: #fff7e0;
    border: 2px solid #e5b93a;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.9rem;
  }
  .ok {
    margin: 0;
    color: var(--good);
    font-size: 0.9rem;
  }
  .arp-rows {
    list-style: none;
    padding: 0;
    margin: 0 0 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .arp-rows li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
</style>
