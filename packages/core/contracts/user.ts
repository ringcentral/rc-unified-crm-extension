import { z } from 'zod';

export const UserSettingSchema = z.looseObject({
  value: z.unknown().describe('Setting value supplied by or returned to the client.').optional(),
  customizable: z.boolean().describe(
    'Whether the user may override the account-managed value.',
  ).optional(),
  isCustomizable: z.boolean().describe(
    'Legacy alias of customizable retained for older clients and connectors.',
  ).optional(),
  isRemoved: z.boolean().describe(
    'Whether the setting has been removed and should be hidden by clients.',
  ).optional(),
  defaultValue: z.unknown().describe('Connector-manifest default used when no value is stored.').optional(),
  options: z.array(z.unknown()).describe('Allowed or suggested values for selection-style settings.').optional(),
}).describe('One connector or App Connect user-setting entry.');

export const UserSettingsSchema = z.record(z.string(), UserSettingSchema).describe(
  'User-setting entries keyed by their manifest setting identifier.',
);

export const UserSettingsEnvelopeSchema = z.looseObject({
  userSettings: UserSettingsSchema.describe('Settings available to the user.').optional(),
}).describe('Optional wrapper used by settings preload and update operations.');

export const UserSettingsUpdateRequestSchema = z.looseObject({
  userSettings: UserSettingsSchema.describe('Setting entries to create or replace.').optional(),
  settingKeysToRemove: z.array(z.string()).describe(
    'Setting identifiers to remove from the user record.',
  ).optional(),
}).describe('Per-user settings upsert and removal request.');

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
