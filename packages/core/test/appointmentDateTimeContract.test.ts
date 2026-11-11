import {
  AppointmentCreateInputSchema,
  AppointmentPatchInputSchema,
  AppointmentSchema,
} from '../contracts/appointment';

describe('appointment timestamp compatibility', () => {
  test.each([
    '2026-11-11T13:45Z',
    '2026-11-11T13:45+08:00',
    '2026-11-11T13:45:30Z',
    '2026-11-11T13:45:30.123-05:30',
  ])('preserves supported timestamp precision: %s', (startTimeUtc) => {
    const input = { title: 'Appointment', summary: '', startTimeUtc, durationMinutes: 30 };
    expect(AppointmentCreateInputSchema.parse(input).startTimeUtc).toBe(startTimeUtc);
    expect(AppointmentPatchInputSchema.parse({ startTimeUtc, durationMinutes: 30 })).toEqual({
      startTimeUtc, durationMinutes: 30,
    });
    expect(AppointmentPatchInputSchema.parse({ startTime: startTimeUtc, durationMinutes: 30 })).toEqual({
      startTime: startTimeUtc, durationMinutes: 30,
    });
    expect(AppointmentSchema.parse({ id: 'appointment-1', startTimeUtc }).startTimeUtc).toBe(startTimeUtc);
  });

  test.each([
    '2026-11-11T13:45',
    '2026-02-30T13:45Z',
    '2026-11-11T25:45Z',
    '2026-11-11',
  ])('continues rejecting invalid or ambiguous timestamps: %s', (startTimeUtc) => {
    expect(AppointmentCreateInputSchema.safeParse({
      title: 'Appointment', summary: '', startTimeUtc, durationMinutes: 30,
    }).success).toBe(false);
    expect(AppointmentPatchInputSchema.safeParse({ startTimeUtc, durationMinutes: 30 }).success).toBe(false);
    expect(AppointmentSchema.safeParse({ id: 'appointment-1', startTimeUtc }).success).toBe(false);
  });
});
