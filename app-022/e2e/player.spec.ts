import { expect, test, type Page } from '@playwright/test';

async function openPlay(page: Page, chars: string): Promise<string> {
  await page.goto('/');
  await page.fill('[data-testid="input-chars"]', chars);
  await page.click('[data-testid="create"]');
  await expect(page).toHaveURL(/\/worksheet\/[^/]+$/);
  const id = page.url().split('/').pop()!;
  await page.goto(`/play/${id}`);
  await expect(page.locator('[data-testid="stroke-player"]')).toBeVisible();
  return id;
}

test.describe('笔顺播放器', () => {
  test('自动播放：逐笔推进，最后一笔写完自动停止', async ({ page }) => {
    await openPlay(page, '木'); // 木 4 画，每画 400ms
    const step = page.locator('[data-testid="player-step"]');
    await expect(step).toContainText('1 / 4');
    // 约 400ms 后进入第二笔（修复前一直停在第一笔）
    await expect(step).toContainText('2 / 4', { timeout: 3000 });
    await expect(step).toContainText('3 / 4', { timeout: 3000 });
    await expect(step).toContainText('4 / 4', { timeout: 3000 });
    // 全部写完：自动停止，按钮恢复为「播放」
    await expect(page.locator('[data-testid="player-toggle"]')).toHaveAttribute('aria-label', '播放', {
      timeout: 3000,
    });
    // 停止后不应再自己跳动
    await page.waitForTimeout(700);
    await expect(step).toContainText('4 / 4');
  });

  test('上一笔在第一笔处不会变成 0/负数，圆点不错乱', async ({ page }) => {
    await openPlay(page, '木');
    const step = page.locator('[data-testid="player-step"]');
    await page.click('[data-testid="player-reset"]');
    await expect(step).toContainText('1 / 4');
    await page.click('[data-testid="player-prev"]');
    await page.click('[data-testid="player-prev"]');
    await expect(step).toContainText('1 / 4');
    await expect(page.locator('.dot.current')).toHaveText('1');
  });

  test('下一笔在最后一笔处不再外溢', async ({ page }) => {
    await openPlay(page, '木');
    const step = page.locator('[data-testid="player-step"]');
    await expect(page.locator('[data-testid="player-toggle"]')).toHaveAttribute('aria-label', '播放', {
      timeout: 6000,
    }); // 等播放结束
    await page.click('[data-testid="player-next"]');
    await expect(step).toContainText('4 / 4');
    await expect(page.locator('.dot.current')).toHaveText('4');
  });

  test('重置会停止播放并停在第一笔，不会自己继续写', async ({ page }) => {
    await openPlay(page, '木');
    await expect(page.locator('[data-testid="player-step"]')).toContainText('2 / 4', { timeout: 3000 });
    await page.click('[data-testid="player-reset"]');
    const step = page.locator('[data-testid="player-step"]');
    await expect(step).toContainText('1 / 4');
    await expect(page.locator('[data-testid="player-toggle"]')).toHaveAttribute('aria-label', '播放');
    await page.waitForTimeout(900); // 超过两笔时长
    await expect(step).toContainText('1 / 4');
  });

  test('全部写完后再点播放：从头重播', async ({ page }) => {
    await openPlay(page, '木');
    const step = page.locator('[data-testid="player-step"]');
    await expect(page.locator('[data-testid="player-toggle"]')).toHaveAttribute('aria-label', '播放', {
      timeout: 6000,
    });
    await expect(step).toContainText('4 / 4');
    await page.click('[data-testid="player-toggle"]');
    await expect(step).toContainText('1 / 4');
    await expect(page.locator('[data-testid="player-toggle"]')).toHaveAttribute('aria-label', '暂停');
  });
});
