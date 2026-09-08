# TIFF Scheduler

東京国際映画祭の鑑賞スケジュールを、移動・昼食・勤務条件を考慮して最適化します。

現在は **Phase 2: Basic UI** まで実装済みです。作品選択、条件設定、最大3案の生成、日別タイムラインを利用できます。

画面の作品・上映・会場・移動時間はすべて架空のサンプルです。実上映データはPhase 3、GitHub Pages公開はPhase 4です。

- [全体仕様](SPEC.md)
- [Phase 1 設計・判断事項](docs/phase1-design.md)
- [Phase 2 UI設計](docs/phase2-design.md)

## 開発

Node.js 24以上を使用します。

```sh
npm ci
npm run dev
# 表示URL: http://localhost:5173/TIFFScheduler/
npm test
npm run typecheck
npm run build
```

`npm run build` はWebアプリを `dist/` に生成します。`npm run preview` で確認できます。
コア単体のJS・型宣言は `npm run build:core` で `lib/` に生成します。

## 利用例

```ts
import { optimizeSchedule, DEFAULT_CONSTRAINTS } from './src/scheduler/index.ts';

const result = optimizeSchedule({
  films: [{ id: 'film-a', title: 'サンプル作品', durationMinutes: 90 }],
  screenings: [{
    id: 'screening-a', filmId: 'film-a', venueId: 'venue-a',
    startAt: '2026-10-31T15:00:00+09:00',
    endAt: '2026-10-31T16:30:00+09:00',
  }],
  venues: [{ id: 'venue-a', name: 'サンプル会場' }],
  travelTimes: [],
  selectedFilmIds: ['film-a'],
  constraints: structuredClone(DEFAULT_CONSTRAINTS),
  holidays: [], // 実運用時は対象年度の祝日を渡す
});

console.log(result.plans[0]);
```

上位3案を未鑑賞数→休暇日数→移動時間→待ち時間で比較します。各案には上映列、見送った作品ID、休暇日付、昼食予約時刻、スコアを含みます。
日時はオフセット必須で、日付/勤務日は常に日本時間として扱います。
サンプルは架空データであり、実際のTIFF上映情報ではありません。
