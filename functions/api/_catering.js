const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validateCateringInquiry(input = {}) {
  const name = String(input.name ?? '').trim();
  const email = String(input.email ?? '').trim();
  const phone = String(input.phone ?? '').trim();
  const eventDate = String(input.eventDate ?? '').trim();
  const guestsRaw = String(input.guests ?? '').trim();
  const eventType = String(input.eventType ?? '').trim() || 'Other';
  const details = String(input.details ?? '').trim();

  if (!name || name.length > 120) return { ok: false, error: 'Valid name required' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Valid email required' };
  if (!/^[0-9()+\-.\s]{7,}$/.test(phone) || (phone.match(/\d/g) || []).length < 7) {
    return { ok: false, error: 'Valid phone required' };
  }
  if (!eventDate) return { ok: false, error: 'Event date required' };
  const guests = Number(guestsRaw);
  if (!Number.isInteger(guests) || guests < 1 || guests > 100000) {
    return { ok: false, error: 'Valid guest count required' };
  }
  if (eventType.length > 60) return { ok: false, error: 'Event type too long' };
  if (details.length > 2000) return { ok: false, error: 'Details too long' };

  return { ok: true, value: { name, email, phone, eventDate, guests, eventType, details } };
}
