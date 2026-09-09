import { useEffect, useState } from 'react';
import { DEFAULT_CONSTRAINTS } from '../scheduler/types.ts';
import { festival, festivalInfo } from '../ui/data.ts';
import { fingerprint } from './codec.ts';
import type { PersistedState } from './codec.ts';
import { createRepository, storageKey } from './repository.ts';

export const festivalId = `tiff-${festivalInfo.year}`;
export const dataFingerprint = fingerprint(festival);
export function usePersistedSchedule() {
  const [initial] = useState(() => {
    const repository = createRepository(festivalId, () => window.localStorage);
    const loaded = repository.load();
    const state: PersistedState = loaded.state ?? {
      schemaVersion: 1, festivalId, dataFingerprint, updatedAt: new Date().toISOString(),
      selectedFilmIds: [], constraints: structuredClone(DEFAULT_CONSTRAINTS), lastResult: null, savedPlans: [],
    };
    const missing = state.selectedFilmIds.filter(id => !festival.films.some(f => f.id === id));
    const changed = state.dataFingerprint !== dataFingerprint;
    state.selectedFilmIds = state.selectedFilmIds.filter(id => !missing.includes(id));
    if (changed || missing.length) state.lastResult = null;
    state.dataFingerprint = dataFingerprint;
    return { repository, state, message: loaded.message, notice: [changed ? '上映情報が更新されています。現在の結果は再生成してください。保存プランは旧スナップショットとして保持しています。' : '', missing.length ? `選択していた作品${missing.length}件が上映データから削除されました（${missing.join('、')}）。` : ''].filter(Boolean).join(' ') };
  });
  const [state, setState] = useState(initial.state);
  const [message, setMessage] = useState(initial.message);
  const [notice, setNotice] = useState(initial.notice);
  useEffect(() => {
    const listener = (event: StorageEvent) => {
      if (event.key !== null && event.key !== storageKey(festivalId)) return;
      initial.repository.block();
      setMessage('別タブで保存内容が更新されました。編集中の内容は保持し、保存を停止しました。再読み込みすると保存内容を読み込めます。');
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }, [initial]);
  useEffect(() => {
    if (state === initial.state) return; // Never overwrite storage during restoration.
    try { initial.repository.save({ ...state, updatedAt: new Date().toISOString() }); setMessage(''); }
    catch (error) { setMessage(error instanceof Error && error.message.includes('別タブ') ? error.message : '保存できませんでした。メモリ上では利用できます。' + (initial.message ? ` ${initial.message}` : '')); }
  }, [state, initial]);
  return { state, setState, message, notice, setNotice };
}
