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
