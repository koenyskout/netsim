import { describe, expect, it } from 'vitest';
import { routeRows } from '../src/engine/routes';
import { warningsFor } from '../src/engine/validate';
import { oneSwitch, twoNetworks } from './fixtures';

const texts = (topo: ReturnType<typeof twoNetworks>, id: string) => warningsFor(topo, id).map((w) => w.text);

describe('configuration hints', () => {
  it('is quiet for a working configuration', () => {
    const topo = twoNetworks();
    expect(texts(topo, 'h1')).toEqual([]);
    expect(texts(topo, 'r1')).toEqual([]);
  });

  it('does not ask for a gateway when there is no router', () => {
    expect(texts(oneSwitch() as never, 'h1')).toEqual([]);
  });

  it('notices a missing gateway when there is a router', () => {
    const topo = twoNetworks();
    delete (topo.devices.h1 as { gateway?: string }).gateway;
    expect(texts(topo, 'h1')[0]).toMatch(/No default gateway/);
  });

  it('notices a gateway outside the own network', () => {
    const topo = twoNetworks({ h1Gateway: '10.0.5.1' });
    expect(texts(topo, 'h1')[0]).toMatch(/not on this computer's own network/);
  });

  it('notices duplicate addresses on both devices', () => {
    const topo = twoNetworks();
    topo.devices.h2.interfaces[0].ip = '10.0.0.2';
    expect(texts(topo, 'h1').join()).toMatch(/also used by h2/);
    expect(texts(topo, 'h2').join()).toMatch(/also used by h1/);
  });

  it('notices a missing IP address', () => {
    const topo = twoNetworks();
    topo.devices.h1.interfaces[0].ip = undefined;
    expect(texts(topo, 'h1')[0]).toMatch(/No IP address/);
  });

  it('notices a route whose next hop cannot be reached', () => {
    const topo = twoNetworks();
    const r1 = topo.devices.r1;
    if (r1.kind !== 'router') throw new Error('expected router');
    r1.routes.push({ network: '10.7.0.0', prefix: 16, via: '172.16.0.9' });
    expect(texts(topo, 'r1')[0]).toMatch(/next hop 172.16.0.9/);
  });
});

describe('routing table rows', () => {
  it('lists connected networks first, then static routes', () => {
    const r1 = twoNetworks().devices.r1;
    if (r1.kind !== 'router') throw new Error('expected router');
    r1.routes.push({ network: '10.7.0.0', prefix: 16, via: '10.0.1.9' });
    const rows = routeRows(r1);
    expect(rows.map((r) => r.network)).toEqual(['10.0.0.0/24', '10.0.1.0/24', '10.7.0.0/16']);
    expect(rows.map((r) => r.connected)).toEqual([true, true, false]);
    expect(rows[2].via).toBe('10.0.1.9');
  });
});
