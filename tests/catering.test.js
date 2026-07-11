import { describe, it, expect } from 'vitest';
import { validateCateringInquiry } from '../functions/api/_catering.js';

const base = { name: 'Gina', email: 'g@x.com', phone: '225-256-3897', eventDate: '2026-08-01', guests: '40' };

describe('validateCateringInquiry', () => {
  it('accepts a complete inquiry and normalizes', () => {
    const r = validateCateringInquiry({ ...base, eventType: 'Wedding', details: '  vegan option  ' });
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({
      name: 'Gina', email: 'g@x.com', phone: '225-256-3897',
      eventDate: '2026-08-01', guests: 40, eventType: 'Wedding', details: 'vegan option',
    });
  });

  it('defaults optional fields', () => {
    const r = validateCateringInquiry(base);
    expect(r.ok).toBe(true);
    expect(r.value.eventType).toBe('Other');
    expect(r.value.details).toBe('');
  });

  it('rejects missing name', () => {
    expect(validateCateringInquiry({ ...base, name: '' }).ok).toBe(false);
  });

  it('rejects bad email', () => {
    expect(validateCateringInquiry({ ...base, email: 'nope' }).ok).toBe(false);
  });

  it('rejects short/invalid phone', () => {
    expect(validateCateringInquiry({ ...base, phone: '12' }).ok).toBe(false);
  });

  it('rejects missing event date', () => {
    expect(validateCateringInquiry({ ...base, eventDate: '' }).ok).toBe(false);
  });

  it('rejects guests < 1 or non-numeric', () => {
    expect(validateCateringInquiry({ ...base, guests: '0' }).ok).toBe(false);
    expect(validateCateringInquiry({ ...base, guests: 'lots' }).ok).toBe(false);
  });

  it('rejects overlong details', () => {
    expect(validateCateringInquiry({ ...base, details: 'x'.repeat(2001) }).ok).toBe(false);
  });
});
