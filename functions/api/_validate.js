const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validateSignup(input = {}) {
  const email = String(input.email ?? '').trim();
  const name = String(input.name ?? '').trim();
  const source = String(input.source ?? '').trim() || 'site';
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Valid email required' };
  if (name.length > 120) return { ok: false, error: 'Name too long' };
  if (source.length > 60) return { ok: false, error: 'Source too long' };
  return { ok: true, value: { email, name, source } };
}
