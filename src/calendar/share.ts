export type ShareResult = 'shared' | 'cancelled' | 'unsupported' | 'failed';

export function calendarFile(contents: string, filename: string): File {
  return new File([contents], filename, { type: 'text/calendar' });
}

export function canShareCalendar(file: File, target: Pick<Navigator, 'share' | 'canShare'> = navigator): boolean {
  if (typeof target.share !== 'function' || typeof target.canShare !== 'function') return false;
  try { return target.canShare({ files: [file] }); } catch { return false; }
}

export async function shareCalendar(file: File, target: Pick<Navigator, 'share' | 'canShare'> = navigator): Promise<ShareResult> {
  if (!canShareCalendar(file, target)) return 'unsupported';
  try {
    await target.share({ files: [file], title: 'TIFF Scheduler' });
    return 'shared';
  } catch (error) {
    return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

export function saveCalendar(file: File, environment: Pick<typeof globalThis, 'URL' | 'document'> = globalThis): void {
  const url = environment.URL.createObjectURL(file);
  try {
    const anchor = environment.document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.hidden = true;
    environment.document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    environment.URL.revokeObjectURL(url);
  }
}
