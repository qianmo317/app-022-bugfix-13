// @vitest-environment jsdom
/**
 * StrokePlayer 状态机测试：逐笔推进/自动停止、上下笔边界、重置停止、写完重播。
 * rAF 与 SVG getTotalLength 用桩替代（jsdom 不实现这两者）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { JSX } from 'react';

// ---- 桩：笔顺数据（木，4 笔） ----
vi.mock('../../src/lib/data', () => ({
  getStrokes: vi.fn((ch: string) =>
    ch === '木'
      ? [
          { path: 'M0 0 L1 1', order: 1 },
          { path: 'M0 1 L1 0', order: 2 },
          { path: 'M1 0 L0 0', order: 3 },
          { path: 'M1 1 L0 1', order: 4 },
        ]
      : undefined,
  ),
}));
vi.mock('../../src/components/paint', () => ({ glyphTransform: () => '' }));

import { StrokePlayer } from '../../src/components/StrokePlayer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---- rAF 桩：手动推进虚拟时钟 ----
let rafId = 0;
let rafCb: ((now: number) => void) | null = null;
let nowMs = 0;

beforeEach(() => {
  nowMs = 0;
  rafCb = null;
  rafId = 0;
  vi.stubGlobal('performance', { now: () => nowMs });
  vi.stubGlobal(
    'requestAnimationFrame',
    (cb: (t: number) => void): number => {
      rafCb = cb;
      return ++rafId;
    },
  );
  vi.stubGlobal('cancelAnimationFrame', (): void => {
    rafCb = null;
  });
  // jsdom 没有 SVGGeometryElement.getTotalLength
  // @ts-expect-error SVG stub
  window.SVGElement.prototype.getTotalLength = () => 100;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 按虚拟时钟持续泵帧，直到推进 ms 毫秒或动画不再调度（停止） */
function advance(ms: number): void {
  const end = nowMs + ms;
  while (nowMs < end) {
    const cb = rafCb;
    if (!cb) {
      nowMs = end;
      break;
    }
    nowMs = Math.min(end, nowMs + 16);
    act(() => {
      cb(nowMs);
    });
  }
}

async function render(char = '木'): Promise<{
  container: HTMLElement;
  step: () => string;
  click: (testid: string) => void;
  toggleAria: () => string | null;
  currentDot: () => string;
}> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<StrokePlayer char={char} autoPlay speed={400} /> as JSX.Element);
  });
  const step = () => container.querySelector('[data-testid="player-step"]')!.textContent ?? '';
  const click = (testid: string) =>
    act(() => {
      (container.querySelector(`[data-testid="${testid}"]`) as HTMLButtonElement).click();
    });
  const toggleAria = () =>
    container.querySelector('[data-testid="player-toggle"]')!.getAttribute('aria-label');
  const currentDot = () => container.querySelector('.dot.current')!.textContent ?? '';
  return { container, step, click, toggleAria, currentDot };
}

describe('StrokePlayer 动画状态机', () => {
  it('播放：每 400ms 推进一笔，第四笔写完自动停止', async () => {
    const { step, toggleAria } = await render();
    expect(step()).toContain('1 / 4');
    advance(300);
    expect(step()).toContain('1 / 4');
    advance(100); // 400ms → 第二笔
    expect(step()).toContain('2 / 4');
    advance(400); // 800
    expect(step()).toContain('3 / 4');
    advance(400); // 1200
    expect(step()).toContain('4 / 4');
    advance(400); // 1600：最后一笔写完
    expect(step()).toContain('4 / 4');
    expect(toggleAria()).toBe('播放'); // 已自动停止
    expect(rafCb).toBeNull(); // 不再有挂起帧（修复前会无限循环）
    // 再推进也不会变化
    advance(1000);
    expect(step()).toContain('4 / 4');
  });

  it('第一笔处按上一笔：钳制在 1，不出现 0/负数', async () => {
    const { step, click, currentDot } = await render();
    click('player-reset');
    expect(step()).toContain('1 / 4');
    click('player-prev');
    click('player-prev');
    expect(step()).toContain('1 / 4');
    expect(currentDot()).toBe('1');
  });

  it('写完后按下一笔：停在最后一笔，不外溢', async () => {
    const { step, click, currentDot } = await render();
    advance(400 * 4);
    expect(step()).toContain('4 / 4');
    click('player-next');
    click('player-next');
    expect(step()).toContain('4 / 4');
    expect(currentDot()).toBe('4');
  });

  it('重置：停止播放、回到第一笔，之后不再自动推进', async () => {
    const { step, click, toggleAria } = await render();
    advance(500); // 已进入第二笔
    expect(step()).toContain('2 / 4');
    click('player-reset');
    expect(step()).toContain('1 / 4');
    expect(toggleAria()).toBe('播放');
    advance(1000); // 修复前会自己接着往下写
    expect(step()).toContain('1 / 4');
  });

  it('全部写完后再点播放：从头重播', async () => {
    const { step, click, toggleAria } = await render();
    advance(400 * 4);
    expect(step()).toContain('4 / 4');
    expect(toggleAria()).toBe('播放');
    click('player-toggle');
    expect(step()).toContain('1 / 4');
    expect(toggleAria()).toBe('暂停');
    advance(400);
    expect(step()).toContain('2 / 4');
  });

  it('播放中点暂停：停在当前笔，再点继续', async () => {
    const { step, click, toggleAria } = await render();
    advance(200);
    click('player-toggle'); // 暂停
    expect(toggleAria()).toBe('播放');
    advance(2000);
    expect(step()).toContain('1 / 4');
    click('player-toggle'); // 继续
    advance(400);
    expect(step()).toContain('2 / 4');
  });

  it('逐笔下一笔/上一笔正常移动', async () => {
    const { step, click } = await render();
    click('player-reset');
    click('player-next');
    expect(step()).toContain('2 / 4');
    click('player-next');
    expect(step()).toContain('3 / 4');
    click('player-prev');
    expect(step()).toContain('2 / 4');
  });
});
