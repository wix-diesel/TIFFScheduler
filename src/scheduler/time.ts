const MINUTE = 60_000;
export function minute(iso: string): number { return Date.parse(iso) / MINUTE; }
export function dateInJapan(value: number): string { return new Date((value + 540) * MINUTE).toISOString().slice(0, 10); }
export function at(date: string, clock: string): number { return minute(`${date}T${clock}:00+09:00`); }
export function isoInJapan(value: number): string { return new Date((value + 540) * MINUTE).toISOString().slice(0, 19) + '+09:00'; }
export function weekday(date: string): number { return new Date(`${date}T00:00:00Z`).getUTCDay(); }
export function overlaps(a: number, b: number, c: number, d: number): boolean { return a < d && c < b; }
