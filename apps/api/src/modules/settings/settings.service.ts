import { eq } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { appSettings } from '../../../drizzle/schema.js';

/**
 * Academy-wide operational switches.
 *
 * These are decisions the academy makes and changes — not deployment config.
 * AI doubt answering is the first: whether the AI may answer a student
 * directly is a teaching-policy call the admin should be able to reverse in
 * seconds, without a redeploy and without an engineer.
 *
 * Defaults are defined here so a missing row behaves sensibly rather than
 * crashing, and so a fresh database needs no seeding.
 */

export const SETTING_DEFAULTS = {
  /** May the AI answer doubts directly? When off, everything goes to mentors. */
  aiDoubtsEnabled: true,
  /** May a student choose the AI themselves? Off = mentors only, no choice. */
  aiDoubtsStudentChoice: true,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSettings(): Promise<Record<SettingKey, boolean>> {
  const rows = await db.select().from(appSettings);
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const out = { ...SETTING_DEFAULTS } as Record<SettingKey, boolean>;
  for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
    const v = stored.get(key);
    if (typeof v === 'boolean') out[key] = v;
  }
  return out;
}

export async function getSetting(key: SettingKey): Promise<boolean> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return typeof row?.value === 'boolean' ? row.value : SETTING_DEFAULTS[key];
}

export async function setSetting(key: SettingKey, value: boolean, userId: string) {
  await db
    .insert(appSettings)
    .values({ key, value, updatedBy: userId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedBy: userId, updatedAt: new Date() },
    });
  return { key, value };
}
