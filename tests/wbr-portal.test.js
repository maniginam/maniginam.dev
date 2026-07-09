import { describe, it, expect } from 'vitest';
import {
  pbkdf2Hex, verifyPassword, hashPassword,
  newIssueId, validateIssue, validateSubscriber,
  VALID_STATUS, VALID_CATEGORY,
  makePortalSession, verifyPortalSession,
} from '../functions/demo/wbr-portal/_lib.js';

const SECRET = 'test-secret';
const NOW = 1_700_000_000_000;

// Known seed vector: username brady, password "wbr2026"
const BRADY = {
  salt: 'dc4b2c1a14e1adf68aa7a5f2bb12e49b',
  hash: '57d218fb90966dd6cb078342d3849587610a84e9b61007bdafccbf111a794edd',
};

describe('pbkdf2Hex matches the Node-generated seed', () => {
  it('reproduces the seed hash for brady/wbr2026', async () => {
    expect(await pbkdf2Hex('wbr2026', BRADY.salt)).toBe(BRADY.hash);
  });
  it('differs for a wrong password', async () => {
    expect(await pbkdf2Hex('nope', BRADY.salt)).not.toBe(BRADY.hash);
  });
});

describe('verifyPassword', () => {
  it('true for correct password against seed row', async () => {
    expect(await verifyPassword('wbr2026', BRADY.hash, BRADY.salt)).toBe(true);
  });
  it('false for wrong password', async () => {
    expect(await verifyPassword('wrong', BRADY.hash, BRADY.salt)).toBe(false);
  });
});

describe('hashPassword round-trips', () => {
  it('a fresh hash verifies', async () => {
    const { hash, salt } = await hashPassword('s3cret!');
    expect(await verifyPassword('s3cret!', hash, salt)).toBe(true);
    expect(await verifyPassword('other', hash, salt)).toBe(false);
  });
});

describe('newIssueId', () => {
  it('is WBR- prefixed with digits', () => {
    expect(newIssueId(1)).toMatch(/^WBR-\d{4,}$/);
  });
  it('is monotonic-ish with count', () => {
    expect(newIssueId(10)).not.toBe(newIssueId(11));
  });
});

describe('validateIssue', () => {
  const good = { category: 'pothole', title: 'Big hole', address: 'Main St', lat: 30.45, lng: -91.2 };
  it('accepts a good payload', () => {
    const r = validateIssue(good);
    expect(r.ok).toBe(true);
    expect(r.value.category).toBe('pothole');
  });
  it('rejects an unknown category', () => {
    expect(validateIssue({ ...good, category: 'aliens' }).ok).toBe(false);
  });
  it('rejects an empty title', () => {
    expect(validateIssue({ ...good, title: '   ' }).ok).toBe(false);
  });
  it('coerces lat/lng to numbers and drops bad ones', () => {
    const r = validateIssue({ ...good, lat: 'x', lng: '10' });
    expect(r.ok).toBe(true);
    expect(r.value.lat).toBeNull();
    expect(r.value.lng).toBe(10);
  });
  it('clamps overly long title', () => {
    const r = validateIssue({ ...good, title: 'a'.repeat(500) });
    expect(r.value.title.length).toBeLessThanOrEqual(160);
  });
  it('every category constant validates', () => {
    for (const c of VALID_CATEGORY) expect(validateIssue({ ...good, category: c }).ok).toBe(true);
  });
});

describe('validateSubscriber', () => {
  it('accepts a valid email', () => {
    expect(validateSubscriber({ email: 'a@b.com' }).ok).toBe(true);
  });
  it('accepts a valid phone only', () => {
    expect(validateSubscriber({ phone: '2253834755' }).ok).toBe(true);
  });
  it('rejects when neither email nor phone', () => {
    expect(validateSubscriber({ name: 'x' }).ok).toBe(false);
  });
  it('rejects a malformed email', () => {
    expect(validateSubscriber({ email: 'nope' }).ok).toBe(false);
  });
});

describe('portal session with role', () => {
  it('round-trips username + role while unexpired', async () => {
    const s = await makePortalSession(SECRET, { username: 'brady', role: 'admin' }, 1000, NOW);
    const v = await verifyPortalSession(s, SECRET, NOW + 500);
    expect(v.ok).toBe(true);
    expect(v.username).toBe('brady');
    expect(v.role).toBe('admin');
  });
  it('fails after expiry', async () => {
    const s = await makePortalSession(SECRET, { username: 'brady', role: 'admin' }, 1000, NOW);
    expect((await verifyPortalSession(s, SECRET, NOW + 5000)).ok).toBe(false);
  });
  it('fails on wrong secret', async () => {
    const s = await makePortalSession(SECRET, { username: 'brady', role: 'admin' }, 1000, NOW);
    expect((await verifyPortalSession(s, 'other', NOW + 100)).ok).toBe(false);
  });
  it('fails on tampered payload', async () => {
    const s = await makePortalSession(SECRET, { username: 'brady', role: 'admin' }, 1000, NOW);
    const tampered = 'x' + s.slice(1);
    expect((await verifyPortalSession(tampered, SECRET, NOW + 100)).ok).toBe(false);
  });
  it('fails on garbage', async () => {
    expect((await verifyPortalSession('garbage', SECRET, NOW)).ok).toBe(false);
  });
});
