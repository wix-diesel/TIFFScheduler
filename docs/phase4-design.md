# Phase 4: Deployment

## 公開フロー

既存の `.github/workflows/ci.yml` を拡張し、検証した成果物をそのままGitHub Pagesへ公開する。

- PR / `feat/**` push: データ検証、型チェック、コアテスト、本番ビルド、ブラウザテスト。公開権限は付与しない。
- `main` push / mainでの手動実行: 同じ検証に成功した `dist/` をPages artifactとしてアップロードし、依存するdeployジョブで公開。
- deployジョブだけに `pages: write` と `id-token: write` を付与。`github-pages` environmentに公開URLを記録。
- 公開ジョブは同時実行せず、進行中の公開をキャンセルしない。
- Viteのbaseは既存の `/TIFFScheduler/` を維持。外部APIやサーバーは不要。

## 初回設定

1. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする。
2. Phase 4のPRをmainへマージする。
3. ActionsのCIでBuild and test、Deploy to GitHub Pagesの成功を確認する。
4. 公開先 `https://wix-diesel.github.io/TIFFScheduler/` を開く。

Settings変更には管理権限が必要。ワークフローから管理者トークンによる自動有効化は行わない。設定済みなら再設定は不要。

参照: [GitHub Pagesのカスタムワークフロー](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## モバイル検証

Playwrightで本番ビルドを `/TIFFScheduler/` から配信し、iPhone 13 mini相当のWebKit、Pixel 5相当のChromium、デスクトップChromiumで検証する。

```sh
npm ci
npx playwright install --with-deps chromium webkit
npm run build
npm run test:e2e
```

確認項目:

- 初回表示、JS/CSSのロード、実行時エラーの有無
- 作品検索・選択・選択中のみの絞り込み
- 追加休日と昼食条件の変更
- スケジュール生成、選択作品のタイムライン表示、横方向のはみ出し
- 条件変更による結果クリアと再生成、リロードによる選択リセット
- 不正な昼食時間帯のエラー表示

CIで失敗した場合はスクリーンショットとtraceを7日間保存する。
WebKitの端末エミュレーションは実機Safariそのものではない。公開後はiPhone実機でも日付・時刻入力、スクロール、生成結果を確認する。

PWA、選択保存、Web Workerによる大量選択時の応答性改善はPhase 5以降。
