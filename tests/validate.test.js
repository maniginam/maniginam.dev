import { describe, it, expect } from 'vitest';
import { validateSignup } from '../functions/api/_validate.js';

describe('validateSignup', () => {
  it('accepts a valid email', () => {
    const r = validateSignup({ email: 'a@b.com' });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ email: 'a@b.com', name: '', source: 'site' });
  });
  it('trims and keeps name + source', () => {
    const r = validateSignup({ email: '  x@y.io ', name: '  Gina ', source: 'footer' });
    expect(r.value).toEqual({ email: 'x@y.io', name: 'Gina', source: 'footer' });
  });
  it('rejects missing email', () => {
    expect(validateSignup({}).ok).toBe(false);
  });
  it('rejects malformed email', () => {
    expect(validateSignup({ email: 'nope' }).ok).toBe(false);
  });
  it('rejects overlong name', () => {
    expect(validateSignup({ email: 'a@b.com', name: 'z'.repeat(121) }).ok).toBe(false);
  });
});
