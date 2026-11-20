import { describe, it, expect } from 'vitest';
import { mergePermissions } from '../lib/permissions.js';
import { startOfIstDay } from '../lib/ist.js';
import { newsSource, withinBudget } from '../modules/doubts/doubts.service.js';
import { SETTING_DEFAULTS, SETTING_SCHEMAS } from '../modules/settings/settings.service.js';
import { createStaffSchema, updateStaffSchema } from '../modules/staff/staff.schema.js';

describe('mergePermissions', () => {
  it('gives someone with several roles everything any of them grants, once', () => {
    const counsellor = ['leads.view', 'leads.manage', 'students.view'];
    const mentor = ['doubts.view', 'doubts.manage', 'students.view'];
    expect(mergePermissions([counsellor, mentor])).toEqual([
      'doubts.manage', 'doubts.view', 'leads.manage', 'leads.view', 'students.view',
    ]);
    expect(mergePermissions([])).toEqual([]);
    expect(mergePermissions([[], mentor])).toEqual([...mentor].sort());
  });
});

describe('staff role selection', () => {
  const base = { name: 'Asha Nair', email: 'asha@example.com', phone: '+919876543210', password: 'longenough1' };
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';

  it('accepts several roles, or the single role older screens send', () => {
    expect(createStaffSchema.safeParse({ ...base, staffRoleIds: [A, B] }).success).toBe(true);
    expect(createStaffSchema.safeParse({ ...base, staffRoleId: A }).success).toBe(true);
  });

  it('refuses a new staff member with no role at all', () => {
    expect(createStaffSchema.safeParse(base).success).toBe(false);
    expect(createStaffSchema.safeParse({ ...base, staffRoleIds: [] }).success).toBe(false);
  });

  it('lets an edit leave the roles alone, but not empty them', () => {
    expect(updateStaffSchema.safeParse({ name: 'Asha N' }).success).toBe(true);
    expect(updateStaffSchema.safeParse({ staffRoleIds: [] }).success).toBe(false);
  });
});

describe('startOfIstDay', () => {
  it('turns the day over at midnight IST, which is 18:30 UTC', () => {
    // 20 Nov 2026, 11:00 IST
    expect(startOfIstDay(new Date('2026-11-20T05:30:00Z')).toISOString()).toBe('2026-11-19T18:30:00.000Z');
    // 23:59 IST is still the 20th; 00:01 IST is the 21st.
    expect(startOfIstDay(new Date('2026-11-20T18:29:00Z')).toISOString()).toBe('2026-11-19T18:30:00.000Z');
    expect(startOfIstDay(new Date('2026-11-20T18:31:00Z')).toISOString()).toBe('2026-11-20T18:30:00.000Z');
  });
});

describe('doubt context', () => {
  it('titles a news item with its IST date, inside the 200-character limit', () => {
    // 19:00 UTC on the 11th is already the 12th in India.
    expect(newsSource('C.P. Radhakrishnan sworn in', new Date('2025-09-11T19:00:00Z')))
      .toBe('Current affairs, 12 Sep 2025: C.P. Radhakrishnan sworn in');
    expect(newsSource('Undated item', null)).toBe('Current affairs: Undated item');
    expect(newsSource('x'.repeat(400), new Date('2026-11-20T06:00:00Z'))).toHaveLength(200);
  });

  it('keeps the best matches within the context budget', () => {
    const chunk = (n: number) => ({ source: `s${n}`, text: 'y'.repeat(2_000) });
    const out = withinBudget([chunk(1), chunk(2), chunk(3), chunk(4), chunk(5)]);
    expect(out.map((c) => c.source)).toEqual(['s1', 's2', 's3', 's4']); // 4 x 1,500 = the 6,000 budget
    expect(out.every((c) => c.text.length === 1_500)).toBe(true);
    expect(withinBudget([])).toEqual([]);
  });
});

describe('settings', () => {
  it('defaults to five AI answers a day and accepts 1 to 100', () => {
    expect(SETTING_DEFAULTS.aiDoubtsDailyLimit).toBe(5);
    const limit = SETTING_SCHEMAS.aiDoubtsDailyLimit;
    expect(limit.safeParse(1).success && limit.safeParse(100).success).toBe(true);
    for (const bad of [0, 101, 2.5, '5', true]) expect(limit.safeParse(bad).success).toBe(false);
  });

  it('keeps the switches boolean', () => {
    expect(SETTING_SCHEMAS.aiDoubtsEnabled.safeParse(false).success).toBe(true);
    expect(SETTING_SCHEMAS.aiDoubtsEnabled.safeParse(1).success).toBe(false);
  });
});
