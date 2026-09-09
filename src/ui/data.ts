import type { ScheduleInput } from '../scheduler/types.ts';
import films from '../data/films.json';
import screenings from '../data/screenings.json';
import venues from '../data/venues.json';
import travelTimes from '../data/travel-times.json';
import holidays from '../data/holidays.json';
export { default as festivalInfo } from '../data/festival.json';
export const festival: Omit<ScheduleInput, 'constraints' | 'selectedFilmIds'> = { films, screenings, venues, travelTimes, holidays };
