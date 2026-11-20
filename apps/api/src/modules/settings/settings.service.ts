import { eq } from 'drizzle-orm';
import { z } from 'zod';
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
  /**
   * AI answers one student may get in a day (the day turns over at midnight
   * IST). Further doubts that day go to a mentor instead of being refused.
   */
  aiDoubtsDailyLimit: 5,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type Settings = { -readonly [K in SettingKey]: (typeof SETTING_DEFAULTS)[K] extends boolean ? boolean : number };

/** What each setting accepts; a stored value that no longer fits falls back to the default. */
export const SETTING_SCHEMAS: { [K in SettingKey]: z.ZodType<Settings[K]> } = {
  aiDoubtsEnabled: z.boolean(),
  aiDoubtsStudentChoice: z.boolean(),
  aiDoubtsDailyLimit: z.number().int().min(1).max(100),
};

function readValue<K extends SettingKey>(key: K, stored: unknown): Settings[K] {
  const parsed = SETTING_SCHEMAS[key].safeParse(stored);
  return parsed.success ? parsed.data : (SETTING_DEFAULTS[key] as Settings[K]);
}

export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(appSettings);
  const stored = new Map<string, unknown>(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<SettingKey, unknown>;
  for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) out[key] = readValue(key, stored.get(key));
  return out as Settings;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return readValue(key, row?.value);
}

export async function setSetting<K extends SettingKey>(key: K, value: Settings[K], userId: string) {
  await db
    .insert(appSettings)
    .values({ key, value, updatedBy: userId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedBy: userId, updatedAt: new Date() },
    });
  return { key, value };
}
