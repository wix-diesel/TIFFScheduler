export interface Film { id: string; title: string; originalTitle?: string; department?: string; durationMinutes: number; url?: string }
export interface Screening { id: string; filmId: string; venueId: string; startAt: string; endAt: string; eventBeforeMinutes?: number; eventAfterMinutes?: number; sourceUrl?: string; timingNote?: string; eventLabel?: string }
export interface Venue { id: string; name: string; address?: string }
export interface TravelTime { fromVenueId: string; toVenueId: string; minutes: number }
export interface UserConstraints {
  /** Maximum screenings whose start time falls on the same JST date. */
  maxScreeningsPerDay?: number | undefined;
  workingWeekdays: number[];
  additionalDaysOff: string[];
  unavailableDates: string[];
  lunchWindowStart: string;
  lunchWindowEnd: string;
  lunchDurationMinutes: number;
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
  /** Explicit holiday calendar, supplied by the caller (Phase 3 data). */
  holidays: readonly string[];
}
export interface ScheduleScore { missedFilmCount: number; vacationDays: number; travelMinutes: number; waitingMinutes: number }
export interface LunchBreak { date: string; startAt: string; endAt: string }
export interface SchedulePlan { screenings: Screening[]; missedFilmIds: string[]; vacationDates: string[]; lunches: LunchBreak[]; score: ScheduleScore }
export interface ScheduleResult { plans: SchedulePlan[]; visitedNodes: number }
export const DEFAULT_CONSTRAINTS: Readonly<UserConstraints> = {
  maxScreeningsPerDay: undefined,
  workingWeekdays: [1, 2, 3, 4, 5], additionalDaysOff: [], unavailableDates: [],
  workStart: '09:00', workEnd: '18:00', lunchWindowStart: '11:30', lunchWindowEnd: '14:30',
  lunchDurationMinutes: 45, exitBufferMinutes: 5, arrivalBufferMinutes: 10,
};
