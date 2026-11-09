// When deep work 1 starts (a synced setting, `workStart`, chosen in Control). Kept apart from routine.ts so the
// startup bundle (hooks.ts) doesn't pull in the whole Ideal Day and calendar export.
export const DEFAULT_WORK_START = '08:00';
export const WORK_START_CHOICES = ['07:30', '07:45', '08:00', '08:15', '08:30', '08:45', '09:00', '09:15', '09:30'];
export const workStartOf = (v: unknown) => (typeof v === 'string' && WORK_START_CHOICES.includes(v) ? v : DEFAULT_WORK_START);
