import { describe, it, expect } from 'vitest';
import {
  timingSafeEqual, hmacHex, makeSession, verifySession, parseCookies, sessionCookieHeader
} from '../functions/admin/_auth.js';

const SECRET = 'test-secret';
const NOW = 1_000_000_000_000;

describe('timingSafeEqual', () => {
  it('true for equal strings', async () => {
    expect(await timingSafeEqual('abc', 'abc')).toBe(true);
  });
  it('false for different strings', async () => {
    expect(await timingSafeEqual('abc', 'abd')).toBe(false);
  });
  it('false for different lengths', async () => {
    expect(await timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('hmacHex', () => {
  it('is deterministic and hex', async () => {
    const a = await hmacHex('msg', SECRET);
    const b = await hmacHex('msg', SECRET);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('differs by secret', async () => {
    expect(await hmacHex('msg', 'x')).not.toBe(await hmacHex('msg', 'y'));
  });
});

describe('session round-trip', () => {
  it('makeSession verifies while unexpired', async () => {
    const s = await makeSession(SECRET, 1000, NOW);
    expect(await verifySession(s, SECRET, NOW + 500)).toBe(true);
  });
  it('fails after expiry', async () => {
    const s = await makeSession(SECRET, 1000, NOW);
    expect(await verifySession(s, SECRET, NOW + 2000)).toBe(false);
  });
  it('fails with wrong secret', async () => {
    const s = await makeSession(SECRET, 1000, NOW);
    expect(await verifySession(s, 'other', NOW + 500)).toBe(false);
  });
  it('fails on tampered signature', async () => {
    const s = await makeSession(SECRET, 1000, NOW);
    const tampered = s.slice(0, -1) + (s.endsWith('a') ? 'b' : 'a');
    expect(await verifySession(tampered, SECRET, NOW + 500)).toBe(false);
  });
  it('fails on malformed value', async () => {
    expect(await verifySession('garbage', SECRET, NOW)).toBe(false);
  });
});

describe('parseCookies', () => {
  it('parses multiple pairs', () => {
    expect(parseCookies('a=1; admin_session=xyz; b=2')).toMatchObject({ a: '1', admin_session: 'xyz', b: '2' });
  });
  it('empty header → empty object', () => {
    expect(parseCookies('')).toEqual({});
  });
});

describe('sessionCookieHeader', () => {
  it('includes required flags', () => {
    const h = sessionCookieHeader('val');
    expect(h).toContain('admin_session=val');
    expect(h).toContain('HttpOnly');
    expect(h).toContain('Secure');
    expect(h).toContain('SameSite=Strict');
    expect(h).toContain('Path=/admin');
    expect(h).toContain('Max-Age=604800');
  });
});
