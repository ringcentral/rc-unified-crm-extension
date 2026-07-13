import { z } from 'zod';

export const UserSettingSchema = z.looseObject({
  value: z.unknown().optional(),
  customizable: z.boolean().optional(),
  isCustomizable: z.boolean().optional(),
  isRemoved: z.boolean().optional(),
  defaultValue: z.unknown().optional(),
  options: z.array(z.unknown()).optional(),
});

export const UserSettingsSchema = z.record(z.string(), UserSettingSchema).describe(
  'User-setting entries keyed by their manifest setting identifier.',
);

export const UserSettingsEnvelopeSchema = z.looseObject({
  userSettings: UserSettingsSchema.optional(),
});

export const UserSettingsUpdateRequestSchema = z.looseObject({
  userSettings: UserSettingsSchema.optional(),
  settingKeysToRemove: z.array(z.string()).optional(),
});

export type UserSettings = z.input<typeof UserSettingsSchema>;
export type UserSettingsEnvelope = z.input<typeof UserSettingsEnvelopeSchema>;
export type UserSettingsUpdateRequest = z.input<typeof UserSettingsUpdateRequestSchema>;

export const userSettingsExample = {
  theme: {
    value: 'dark',
    customizable: true,
    defaultValue: 'system',
    options: ['system', 'light', 'dark'],
  },
} satisfies UserSettings;

export const userSettingsEnvelopeExample = {
  userSettings: userSettingsExample,
} satisfies UserSettingsEnvelope;

export const emptyUserSettingsEnvelopeExample = {} satisfies UserSettingsEnvelope;

export const userSettingsUpdateRequestExample = {
  userSettings: userSettingsExample,
  settingKeysToRemove: ['legacySetting'],
} satisfies UserSettingsUpdateRequest;
