import { expect, test, type Page } from '@playwright/test';

async function createWorksheet(page: Page, chars: string): Promise<string> {
  await page.goto('/');
  await page.fill('[data-testid="input-chars"]', chars);
  await page.click('[data-testid="create"]');
  await expect(page).toHaveURL(/\/worksheet\/[^/]+$/);
  return page.url().split('/').pop()!;
}

test.describe('笔顺播放器', () => {
  test('自动逐笔推进，最后一笔画完停止', async ({ page }) => {
    const id = await createWorksheet(page, '木'); // 木 4 画
    await page.goto(`/play/${id}`);
    const step = page.locator('[data-testid="player-step"]');
    const toggle = page.locator('[data-testid="player-toggle"]');

    await expect(step).toContainText('1 / 4');
    // autoPlay 下应自动经过 2、3，停在 4
    await expect(step).toContainText('2 / 4', { timeout: 3000 });
    await expect(step).toContainText('3 / 4', { timeout: 3000 });
    await expect(step).toContainText('4 / 4', { timeout: 3000 });
    // 自动停止：按钮恢复为「播放」图标
    await expect(toggle).toContainText('▶');
    // 全部圆点标记完成，无当前笔
    await expect(page.locator('[data-testid="stroke-dot"].done')).toHaveCount(4);
    await expect(page.locator('[data-testid="stroke-dot"].current')).toHaveCount(0);
  });

  test('全部写完后再点播放，从第一笔重新开始', async ({ page }) => {
    const id = await createWorksheet(page, '木');
    await page.goto(`/play/${id}`);
    const step = page.locator('[data-testid="player-step"]');
    const toggle = page.locator('[data-testid="player-toggle"]');

    await expect(step).toContainText('4 / 4', { timeout: 5000 });
    await expect(toggle).toContainText('▶');
    await toggle.click();
    await expect(step).toContainText('1 / 4');
    await expect(step).toContainText('2 / 4', { timeout: 3000 });
  });

  test('上一笔/下一笔夹在首笔与末笔之间，不会出现 0 或越界', async ({ page }) => {
    const id = await createWorksheet(page, '木');
    await page.goto(`/play/${id}`);
    const step = page.locator('[data-testid="player-step"]');
    const prev = page.locator('[data-testid="player-prev"]');
    const next = page.locator('[data-testid="player-next"]');

    // 先暂停在第一笔（自动播放已开始，上一笔回到第 1 笔）
    await prev.click();
    await expect(step).toContainText('1 / 4');
    await prev.click();
    await expect(step).toContainText('1 / 4');
    await expect(page.locator('[data-testid="stroke-dot"].current')).toHaveText('1');

    for (let i = 0; i < 5; i++) {
      await next.click();
    }
    await expect(step).toContainText('4 / 4');
    await expect(step).not.toContainText('5 / 4');
    await expect(page.locator('[data-testid="stroke-dot"].done')).toHaveCount(4);
    await expect(page.locator('[data-testid="stroke-dot"].current')).toHaveCount(0);
  });

  test('播放中点重置：画面清空并停止，不会自己继续写', async ({ page }) => {
    const id = await createWorksheet(page, '木');
    await page.goto(`/play/${id}`);
    const step = page.locator('[data-testid="player-step"]');
    const toggle = page.locator('[data-testid="player-toggle"]');
    const reset = page.locator('[data-testid="player-reset"]');

    // 先回到第 1 笔暂停，再播放；慢档让每笔停留更久便于观察
    await reset.click();
    await page.getByRole('group', { name: '播放速度' }).getByText('慢').click();
    await toggle.click();
    await expect(step).toContainText('2 / 4');
    await reset.click();
    await expect(step).toContainText('1 / 4');
    await expect(toggle).toContainText('▶');
    await expect(page.locator('[data-testid="stroke-dot"].done')).toHaveCount(0);
    await expect(page.locator('[data-testid="stroke-dot"].current')).toHaveText('1');
    // 等待超过两笔的时长，仍停在第 1 笔
    await page.waitForTimeout(1400);
    await expect(step).toContainText('1 / 4');
  });
});
