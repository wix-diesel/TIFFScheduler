# TIFF Scheduler

東京国際映画祭の鑑賞スケジュールを、移動・昼食・勤務条件を考慮して最適化します。

現在は **Phase 4: Deployment** の公開ワークフローとブラウザテストまで実装済みです。2025年の公式データ（149作品・282上映・13会場）で、作品検索・選択、条件設定、最大3案の生成、日別タイムライン、設定の自動復元、名前付きプラン保存を利用できます。

2026年の上映情報未公開のため、2025年10月27日〜11月5日を対象にしています。終了はイベント等を含む確保枠、移動時間は保守的な推定です。本編時間不明の企画等35件は除外し、時刻不整合6件を補正しています。11月3日は祝日として計算します。GitHub Pages公開には、初回のPages設定とmainへのマージが必要です。

- [全体仕様](SPEC.md)
- [Phase 1 設計・判断事項](docs/phase1-design.md)
- [Phase 2 UI設計](docs/phase2-design.md)
- [Phase 3 データ出典・取り込み・移動時間・制限](docs/phase3-design.md)
- [Phase 4 公開設定・モバイル検証](docs/phase4-design.md)

## 開発

Node.js 24以上を使用します。

```sh
npm ci
npm run dev
# 表示URL: http://localhost:5173/TIFFScheduler/
npm test
npm run data:check
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
上のコード例は架空データです。アプリは `src/data/` の2025年実データを使用します。

保存済み出典からの再生成は `npm run data:import`。公式レスポンスの手動取り込みは `npm run data:import -- /path/to/official-venues-acts.json`。通常のビルドは公式サイトへ通信しません。


## 設定・プランの保存

作品選択、鑑賞条件、生成した最大3案は自動保存され、再読み込みで復元します。「プラン Nを保存」で名前付きプランを追加できます（最大20件）。「保存したプラン」を開くと閲覧・名前変更・削除できます。現在の条件を変更しても保存プランは残ります。

「この条件で再計算」で保存時の条件を読み込み、「スケジュールを生成」で最新データを使って再計算します。上映情報更新時は過去プランに警告を表示します。「設定・作品選択を初期化」は保存プランを残し、「保存プランを全削除」は確認後にプランだけを削除します。

保存先はこのブラウザ内です。別端末や別ブラウザ、開発環境と公開サイト間では共有しません。ブラウザのサイトデータ削除で失われます。保存禁止・容量不足・破損などの場合は「保存できませんでした」と表示し、その画面では引き続き利用できますが、変更は永続化されません。別タブ更新の通知が出た場合は編集中の内容を確認してから再読み込みしてください。

[保存形式・復元・障害時の設計](docs/storage-design.md)
