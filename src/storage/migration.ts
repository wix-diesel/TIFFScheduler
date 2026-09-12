import { DEFAULT_CONSTRAINTS } from '../scheduler/types.ts';
import type { UserConstraints } from '../scheduler/types.ts';

// Version 1 permits omitted fields so later optional settings can acquire defaults here.
export function migrateConstraints(value: Partial<UserConstraints>): UserConstraints {
  return { ...structuredClone(DEFAULT_CONSTRAINTS), ...value, afternoonLeaveDates: value.afternoonLeaveDates ?? [], afternoonLeaveStart: value.afternoonLeaveStart ?? '13:00' };
}
