import { expect, test } from '@playwright/test';

// Exercise the production bundle at the same subpath as GitHub Pages.
test('select films, edit constraints and generate a mobile-friendly plan', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(request.url()));
  page.on('response', response => { if (response.status() >= 400) errors.push(response.url()); });
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const generate = page.getByRole('button', { name: 'スケジュールを生成' });
  await expect(generate).toBeDisabled();
  const cards = page.locator('.film-card');
  const title = await cards.first().locator('strong').innerText();
  await page.getByRole('searchbox', { name: '作品名で検索' }).fill(title);
  await cards.first().getByRole('checkbox').check();
  await page.getByRole('searchbox').fill('');
  await page.getByRole('checkbox', { name: '選択中のみ' }).check();
  await expect(cards).toHaveCount(1);
  await page.getByLabel('追加休日', { exact: true }).fill('2025-10-28');
  await page.locator('.date-list').first().getByRole('button', { name: '追加', exact: true }).click();
  await expect(page.getByRole('button', { name: '追加休日 2025-10-28を削除' })).toBeVisible();
  await page.getByLabel('確保する時間').selectOption('45');
  await page.getByLabel('最大上映本数').fill('1');
  await page.getByLabel('この時刻以降').fill('09:00');
  await page.getByLabel('この時刻までに終了').fill('23:00');
  await generate.click();
  await expect(page.locator('.plan').first()).toBeVisible();
  await expect(page.locator('.plan').first().locator('.timeline .film strong')).toHaveText(title);
  await expect(page.locator('.plan').first()).toContainText('休暇');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel('退場（分）').fill('15');
  await expect(page.locator('.plan')).toHaveCount(0);
  await generate.click();
  await expect(page.locator('.plan').first()).toBeVisible();
  await page.reload();
  await expect(generate).toBeEnabled();
  await expect(page.getByLabel('最大上映本数')).toHaveValue('1');
  await expect(page.getByLabel('この時刻以降')).toHaveValue('09:00');
  await expect(page.getByLabel('この時刻までに終了')).toHaveValue('23:00');
  await expect(page.getByLabel('退場（分）')).toHaveValue('15');
  await expect(page.locator('.plan').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('invalid lunch settings show an actionable error', async ({ page }) => {
  await page.goto('./');
  await page.locator('.film-card').first().getByRole('checkbox').check();
  await page.getByLabel('開始', { exact: true }).fill('14:00');
  await page.getByLabel('終了', { exact: true }).fill('12:00');
  await page.getByRole('button', { name: 'スケジュールを生成' }).click();
  await expect(page.getByRole('alert')).toContainText('昼食時間帯');
  await expect(page.locator('.plan')).toHaveCount(0);
});

test('browse a compact catalog and keep selections across pages and filters', async ({ page }) => {
  await page.goto('./');
  const cards = page.locator('.film-card');
  await expect(cards).toHaveCount(12);
  await expect(cards.first().locator('.screenings')).toBeHidden();
  const firstTitle = await cards.first().locator('strong').innerText();
  await cards.first().getByRole('checkbox').check();
  await page.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(page.getByLabel('作品一覧のページ番号')).toHaveValue('2');
  await cards.first().getByRole('checkbox').check();
  await page.getByRole('button', { name: '選んだ2作品を確認' }).click();
  await expect(cards).toHaveCount(2);
  await expect(cards.getByRole('checkbox', { checked: true })).toHaveCount(2);
  await page.getByRole('searchbox').fill('存在しない作品xyz');
  await expect(cards).toHaveCount(0);
  await page.getByRole('button', { name: '選んだ2作品を確認' }).click();
  await expect(cards).toHaveCount(2);
  // Unselecting removes the card immediately; click once and assert the resulting list.
  await page.getByRole('checkbox', { name: firstTitle, exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(page.getByRole('checkbox', { name: firstTitle, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '絞り込みを解除' }).click();
  await expect(cards).toHaveCount(12);
  await page.getByLabel('上映日で絞り込み').selectOption('2025-10-27');
  await cards.first().getByText('上映日時・会場を見る', { exact: true }).click();
  await expect(cards.first().locator('.screenings')).toContainText(/10(?:月|\/)27/);
  await page.getByRole('button', { name: '絞り込みを解除' }).click();
  await page.getByLabel('作品一覧のページ番号').selectOption('13');
  await expect(cards).toHaveCount(5);
  await expect(page.getByRole('button', { name: '次へ', exact: true })).toBeDisabled();
  await page.getByRole('searchbox').fill(firstTitle);
  await expect(cards.first().locator('strong')).toHaveText(firstTitle);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('combine department, title and date filters without losing selected films', async ({ page }) => {
  await page.goto('./');
  const cards = page.locator('.film-card');
  await page.getByLabel('部門で絞り込み').selectOption('コンペティション');
  await expect(cards).toHaveCount(12);
  await expect(page.getByRole('status')).toContainText('15作品中');
  const title = await cards.first().locator('strong').innerText();
  await cards.first().getByRole('checkbox').check();
  await page.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) await expect(card.locator('.film-department')).toHaveText('コンペティション');
  await page.getByRole('searchbox').fill(title);
  await expect(cards).toHaveCount(1);
  await expect(cards.first().getByRole('checkbox')).toBeChecked();
  await page.getByLabel('部門で絞り込み').selectOption('アニメーション');
  await expect(cards).toHaveCount(0);
  await page.getByRole('button', { name: '選んだ1作品を確認' }).click();
  await expect(page.getByLabel('部門で絞り込み')).toHaveValue('');
  await expect(cards.first().locator('strong')).toHaveText(title);
  await page.getByRole('button', { name: '絞り込みを解除' }).click();
  await page.getByLabel('部門で絞り込み').selectOption('ワールド・フォーカス');
  await page.getByLabel('上映日で絞り込み').selectOption('2025-10-27');
  await expect(cards.first()).toBeVisible();
  for (const card of await cards.all()) {
    await expect(card.locator('.film-department')).toHaveText('ワールド・フォーカス');
    await card.getByText('上映日時・会場を見る', { exact: true }).click();
    await expect(card.locator('.screenings')).toContainText(/10(?:月|\/)27/);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('named snapshots survive edits and reload, and deletion requires confirmation',async({page})=>{
 await page.goto('./');await page.locator('.film-card').first().getByRole('checkbox').check();
 await page.getByRole('button',{name:'スケジュールを生成'}).click();
 await page.getByRole('button',{name:'プラン 1を保存',exact:true}).click();
 const saved=page.getByRole('region',{name:'04 保存したプラン'});
 await saved.getByText('保存プラン 1',{exact:true}).click();
 await saved.getByLabel('プラン名').fill('週末の映画祭');
 const timeline=await saved.locator('.timeline').allTextContents();
 await page.getByLabel('退場（分）').fill('20');
 await expect(saved.locator('.plan')).toHaveCount(1);
 await page.reload();await saved.getByText('週末の映画祭',{exact:true}).click();
 expect(await saved.locator('.timeline').allTextContents()).toEqual(timeline);
 await saved.getByRole('button',{name:'この条件で再計算'}).click();
 await expect(page.getByLabel('退場（分）')).toHaveValue('5');
 await page.getByRole('button',{name:'設定・作品選択を初期化'}).click();
 await expect(saved.getByLabel('プラン名')).toHaveValue('週末の映画祭');
 await saved.getByRole('button',{name:'保存プランを全削除',exact:true}).click();
 const dialog=page.getByRole('alertdialog',{name:'保存プラン全削除の確認'});
 await expect(dialog).toHaveAttribute('aria-modal','true');
 await expect(dialog).toHaveAccessibleDescription('保存プランをすべて削除しますか？設定・作品選択は残ります。');
 await expect(dialog.getByRole('button',{name:'キャンセル',exact:true})).toBeFocused();
 await page.keyboard.press('Shift+Tab');
 await expect(dialog.getByRole('button',{name:'すべて削除する',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 await expect(saved.getByRole('button',{name:'保存プランを全削除',exact:true})).toBeFocused();
 await saved.getByRole('button',{name:'保存プランを全削除',exact:true}).click();
 await page.getByRole('button',{name:'キャンセル',exact:true}).click();
 await expect(saved.getByLabel('プラン名')).toHaveValue('週末の映画祭');
 await saved.getByRole('button',{name:'保存プランを全削除',exact:true}).click();
 await page.getByRole('button',{name:'すべて削除する',exact:true}).click();await page.reload();
 await expect(saved).toContainText('0/20件');
});

test('updated data removes missing selections but preserves old named snapshots',async({page})=>{
 await page.goto('./');await page.locator('.film-card').first().getByRole('checkbox').check();await page.getByRole('button',{name:'スケジュールを生成'}).click();await page.getByRole('button',{name:'プラン 1を保存',exact:true}).click();
 await page.evaluate(()=>{const key='tiff-scheduler:tiff-2025';const v=JSON.parse(localStorage.getItem(key)!);v.dataFingerprint='old';v.selectedFilmIds.push('removed-film');v.savedPlans[0].dataFingerprint='old';localStorage.setItem(key,JSON.stringify(v));});
 await page.reload();await expect(page.getByText(/選択していた作品1件/)).toBeVisible();
 await page.getByText('保存プラン 1',{exact:true}).click();await expect(page.getByText('上映情報が更新されています。このプランは保存時の情報です。')).toBeVisible();
 await expect(page.locator('.plan')).toHaveCount(1);
});

for(const value of ['{',JSON.stringify({schemaVersion:999})])test(`unreadable storage remains untouched: ${value}`,async({page})=>{
 await page.goto('./');await page.evaluate(value=>localStorage.setItem('tiff-scheduler:tiff-2025',value),value);await page.reload();
 await expect(page.getByRole('alert')).toContainText('保存できませんでした');
 await page.locator('.film-card').first().getByRole('checkbox').check();await page.getByRole('button',{name:'スケジュールを生成'}).click();await expect(page.locator('.plan').first()).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('tiff-scheduler:tiff-2025'))).toBe(value);
});

test('another tab warns without replacing in-progress choices',async({page,context})=>{
 await page.goto('./');const other=await context.newPage();await other.goto('./');
 await page.locator('.film-card').first().getByRole('checkbox').check();
 await expect(other.getByRole('alert')).toContainText('別タブ');await expect(other.getByRole('button',{name:'スケジュールを生成'})).toBeDisabled();
 await other.getByLabel('退場（分）').fill('35');
 await page.reload();await expect(page.getByLabel('退場（分）')).toHaveValue('5');
});

test('quota failures keep generated plans usable in memory',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError');};});
 await page.goto('./');await page.locator('.film-card').first().getByRole('checkbox').check();await page.getByRole('button',{name:'スケジュールを生成'}).click();
 await expect(page.getByRole('alert')).toContainText('保存できませんでした');await expect(page.locator('.plan').first()).toBeVisible();
});

test('20 named plans require explicit deletion before saving another',async({page})=>{
 await page.goto('./');await page.locator('.film-card').first().getByRole('checkbox').check();await page.getByRole('button',{name:'スケジュールを生成'}).click();await page.getByRole('button',{name:'プラン 1を保存',exact:true}).click();
 await page.evaluate(()=>{const key='tiff-scheduler:tiff-2025';const v=JSON.parse(localStorage.getItem(key)!);v.savedPlans=Array.from({length:20},(_,i)=>({...v.savedPlans[0],id:String(i),name:`保存 ${i}`}));localStorage.setItem(key,JSON.stringify(v));});await page.reload();
 await page.getByRole('button',{name:'プラン 1を保存',exact:true}).click();await expect(page.getByRole('alert')).toContainText('20件まで');
 await page.getByText('保存 0',{exact:true}).click();await page.getByRole('button',{name:'この保存プランを削除',exact:true}).first().click();
 await page.getByRole('button',{name:'プラン 1を保存',exact:true}).click();await page.reload();
 await expect(page.getByRole('region',{name:'04 保存したプラン'})).toContainText('20/20件');
});

test('denied localStorage getter does not prevent generation',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('denied','SecurityError');}});});
 await page.goto('./');await expect(page.getByRole('alert')).toContainText('保存できませんでした');
 await page.locator('.film-card').first().getByRole('checkbox').check();await page.getByRole('button',{name:'スケジュールを生成'}).click();await expect(page.locator('.plan').first()).toBeVisible();
});
