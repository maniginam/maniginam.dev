import { describe, it, expect } from 'vitest';
import { makeShareTicket, verifyShareTicket } from '../functions/demo/_share.js';

const SECRET = 'test-secret';
const NOW = 1_000_000_000_000;

describe('share tickets', () => {
  it('verifies a fresh ticket for the right slug', async () => {
    const t = await makeShareTicket('chopshop', SECRET, 1000, NOW);
    const r = await verifyShareTicket(t, 'chopshop', SECRET, NOW + 500);
    expect(r.ok).toBe(true);
    expect(r.expiry).toBe(NOW + 1000);
  });

  it('rejects after expiry', async () => {
    const t = await makeShareTicket('chopshop', SECRET, 1000, NOW);
    expect((await verifyShareTicket(t, 'chopshop', SECRET, NOW + 2000)).ok).toBe(false);
  });

  it('rejects a ticket for a different slug', async () => {
    const t = await makeShareTicket('chopshop', SECRET, 1000, NOW);
    expect((await verifyShareTicket(t, 'wbr-fintech', SECRET, NOW + 500)).ok).toBe(false);
  });

  it('rejects a tampered signature', async () => {
    const t = await makeShareTicket('chopshop', SECRET, 1000, NOW);
    const bad = t.slice(0, -1) + (t.endsWith('a') ? 'b' : 'a');
    expect((await verifyShareTicket(bad, 'chopshop', SECRET, NOW + 500)).ok).toBe(false);
  });

  it('rejects a wrong secret', async () => {
    const t = await makeShareTicket('chopshop', SECRET, 1000, NOW);
    expect((await verifyShareTicket(t, 'chopshop', 'other', NOW + 500)).ok).toBe(false);
  });

  it('rejects garbage', async () => {
    expect((await verifyShareTicket('nope', 'chopshop', SECRET, NOW)).ok).toBe(false);
    expect((await verifyShareTicket('', 'chopshop', SECRET, NOW)).ok).toBe(false);
  });
});
