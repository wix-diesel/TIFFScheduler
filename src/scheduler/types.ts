export interface Film { id: string; title: string; originalTitle?: string; department?: string; durationMinutes: number; url?: string }
export interface Screening { id: string; filmId: string; venueId: string; startAt: string; endAt: string; eventBeforeMinutes?: number; eventAfterMinutes?: number; sourceUrl?: string; timingNote?: string; eventLabel?: string }
export interface Venue { id: string; name: string; address?: string }
export interface TravelTime { fromVenueId: string; toVenueId: string; minutes: number }
export interface UserConstraints {
  /** Maximum screenings whose start time falls on the same JST date. */
  maxScreeningsPerDay?: number | undefined;
  /** Earliest screening start including any event before it, as a JST HH:mm clock. */
  earliestScreeningStart?: string | undefined;
  /** Latest screening end including any event after it, as a JST HH:mm clock. */
  latestScreeningEnd?: string | undefined;
  workingWeekdays: number[];
  additionalDaysOff: string[];
  unavailableDates: string[];
  /** Dates on which only an afternoon leave is available. */
  afternoonLeaveDates: string[];
  /** Common start time for afternoon leave. */
  afternoonLeaveStart: string;
  lunchWindowStart: string;
  lunchWindowEnd: string;
  lunchDurationMinutes: number;
  /** Whether to reserve an evening meal on days whose itinerary reaches its window. */
  dinnerEnabled: boolean;
  dinnerWindowStart: string;
  dinnerWindowEnd: string;
  dinnerDurationMinutes: number;
  exitBufferMinutes: number;
  arrivalBufferMinutes: number;
  workStart?: string;
  workEnd?: string;
}
export interface ScheduleInput {
  films: readonly Film[];
  screenings: readonly Screening[];
  venues: readonly Venue[];
  travelTimes: readonly TravelTime[];
  selectedFilmIds: readonly string[];
  constraints: UserConstraints;
/** Holiday calendar supplied by the caller (validated for date format only); it does not affect vacation-day calculation. */
  holidays: readonly string[];
}
export type VacationDayKind = 'full' | 'afternoon';
export interface VacationDay { date: string; kind: VacationDayKind; units: 1 | 2 }
export interface ScheduleScore {
  missedFilmCount: number;
  /** Leave amount in half-day units (full day = 2, afternoon leave = 1). */
  vacationUnits: number;
  /** Display/backward-compatible representation of vacationUnits / 2. */
  vacationDays: number;
  screeningDays: number;
  travelMinutes: number;
  waitingMinutes: number;
}
export type MealKind = 'lunch' | 'dinner';
export interface MealBreak { kind: MealKind; date: string; startAt: string; endAt: string }
/** @deprecated Use MealBreak with kind: 'lunch'. */
export type LunchBreak = Omit<MealBreak, 'kind'>;
export interface SchedulePlan {
  screenings: Screening[];
  missedFilmIds: string[];
  /** Dates requiring leave, retained for compatibility with saved snapshots. */
  vacationDates: string[];
  /** Per-date leave kind and half-day units. */
  vacationDetails: VacationDay[];
  meals: MealBreak[];
  /** @deprecated Kept when reading pre-dinner saved snapshots. New plans use meals. */
  lunches: LunchBreak[];
  score: ScheduleScore;
}
export interface ScheduleResult { plans: SchedulePlan[]; visitedNodes: number }
export const DEFAULT_CONSTRAINTS: Readonly<UserConstraints> = {
  maxScreeningsPerDay: undefined,
  earliestScreeningStart: undefined,
  latestScreeningEnd: undefined,
  workingWeekdays: [1, 2, 3, 4, 5], additionalDaysOff: [], unavailableDates: [], afternoonLeaveDates: [], afternoonLeaveStart: '13:00',
  workStart: '09:00', workEnd: '18:00', lunchWindowStart: '11:30', lunchWindowEnd: '14:30',
  lunchDurationMinutes: 45, dinnerEnabled: false, dinnerWindowStart: '18:00', dinnerWindowEnd: '21:00', dinnerDurationMinutes: 45,
  exitBufferMinutes: 5, arrivalBufferMinutes: 10,
};
