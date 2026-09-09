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
  await expect(generate).toBeDisabled();
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
  await cards.first().getByRole('checkbox').uncheck();
  await expect(cards).toHaveCount(1);
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
