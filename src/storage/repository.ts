import { decode, encode, FutureSchemaError } from './codec.ts';
import type { PersistedState } from './codec.ts';
export const storageKey = (festivalId: string) => `tiff-scheduler:${festivalId}`;
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function createRepository(festivalId: string, getStorage: () => StoragePort) {
  let baseline: string | null = null;
  let blocked = false;
  return {
    load() {
      try { baseline = getStorage().getItem(storageKey(festivalId)); return { state: baseline === null ? null : decode(baseline, festivalId), message: '' }; }
      catch (error) {
        blocked = true;
        return { state: null, message: error instanceof FutureSchemaError ? '保存できませんでした。新しい版の保存データがあるため上書きせず、メモリ上で利用します。' : '保存できませんでした。保存データを読み込めないため、メモリ上で利用します。' };
      }
    },
    save(state: PersistedState) {
      if (blocked) throw new Error('保存できませんでした。元の保存データを保護し、メモリ上で利用しています。');
      const storage = getStorage();
      if (storage.getItem(storageKey(festivalId)) !== baseline) {
        blocked = true;
        throw new Error('別タブで保存内容が更新されました。保存を停止しました。必要な内容を確認して再読み込みしてください。');
      }
      const raw = encode(state);
      storage.setItem(storageKey(festivalId), raw);
      baseline = raw;
    },
    block() { blocked = true; },
  };
}
