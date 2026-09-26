/**
 * 笔顺播放器：requestAnimationFrame 逐笔描边动画。
 * 已完成笔画灰色，当前笔画用 dashoffset 从 0 长度逐渐画出。
 * 支持播放/暂停/重置/上一笔/下一笔、点击步骤圆点跳转、Space/←/→ 键盘控制。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { JSX, KeyboardEvent } from 'react';
import { getStrokes } from '../lib/data';
import { glyphTransform } from './paint';
import { isCjk } from '../lib/input';

export const SPEED_PRESETS = [
  { label: '慢', ms: 600 },
  { label: '常', ms: 400 },
  { label: '快', ms: 250 },
] as const;

type Props = {
  char: string;
  /** 显示尺寸（mm），默认 40 */
  sizeMm?: number;
  autoPlay?: boolean;
  /** 每笔时长 ms */
  speed?: number;
  /** 迷你模式隐藏文字按钮，只保留图标 */
  compact?: boolean;
};

/** 正在描红的当前笔：挂载后自量路径长度，避免切笔首帧长度取 0 闪一帧整笔 */
function ActiveStroke({ d, progress }: { d: string; progress: number }): JSX.Element {
  const ref = useRef<SVGPathElement | null>(null);
  const [len, setLen] = useState(0);
  useLayoutEffect(() => {
    if (ref.current) setLen(ref.current.getTotalLength());
  }, [d]);
  return (
    <path
      ref={ref}
      d={d}
      fill="none"
      stroke="#222"
      strokeWidth={58}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={len}
      strokeDashoffset={len * (1 - progress)}
    />
  );
}

export function StrokePlayer({ char, sizeMm = 40, autoPlay = false, speed = 400, compact = false }: Props): JSX.Element {
  const strokes = getStrokes(char);
  const total = strokes?.length ?? 0;
  const [done, setDone] = useState(0); // 已完成笔画数（当前笔 = done，0 基索引；=== total 表示全部写完）
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 当前笔 0..1
  const rafRef = useRef(0);
  const startRef = useRef(0);

  // 切字时重置
  useEffect(() => {
    setDone(0);
    setProgress(0);
    setPlaying(autoPlay && total > 0);
  }, [char, autoPlay, total]);

  // rAF 动画循环：当前笔画满即推进下一笔，最后一笔画完自动停止
  useEffect(() => {
    if (!playing) return;
    startRef.current = performance.now();
    const tick = (now: number) => {
      const p = (now - startRef.current) / speed;
      if (p >= 1) {
        if (done >= total - 1) {
          setProgress(1);
          setDone(total);
          setPlaying(false);
          return; // 不再请求下一帧
        }
        // 推进下一笔：effect 随 done 重启，startRef 自动以当前时刻重新计时
        setProgress(0);
        setDone(done + 1);
      } else {
        setProgress(p);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, done, speed, total]);

  /** 跳到指定笔（钳制在 0..total-1）并把当前笔进度归零 */
  const seek = useCallback(
    (next: number) => {
      setDone(Math.max(0, Math.min(total - 1, next)));
      setProgress(0);
      startRef.current = performance.now();
    },
    [total],
  );

  const reset = useCallback(() => {
    setPlaying(false);
    setDone(0);
    setProgress(0);
  }, []);

  const prev = useCallback(() => seek(done - 1), [done, seek]);
  const next = useCallback(() => seek(done + 1), [done, seek]);

  const toggle = useCallback(() => {
    if (total === 0) return;
    if (!playing && done >= total) {
      // 已全部写完：再按播放从头重播
      setDone(0);
      setProgress(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  }, [playing, done, total]);

  // 键盘：Space 播放/暂停，← 上一笔，→ 下一笔
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === ' ') {
      e.preventDefault();
      toggle();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    }
  };

  if (!strokes) {
    return (
      <div className="player player-empty" data-testid="player-no-data">
        {isCjk(char) ? `「${char}」无笔顺数据` : `「${char}」不是汉字`}
      </div>
    );
  }

  return (
    <div className="player" data-testid="stroke-player" tabIndex={0} onKeyDown={onKeyDown}>
      <svg
        className="player-svg"
        width={`${sizeMm}mm`}
        height={`${sizeMm}mm`}
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${char} 笔顺演示`}
      >
        <rect x={1} y={1} width={98} height={98} fill="#fff" stroke="#d0d4d8" strokeWidth={1.5} rx={3} />
        <g transform={glyphTransform(50, 50)}>
          {strokes.map((s, i) => {
            if (i > done) return null; // 未写到的笔不显示
            if (i === done && playing) {
              return <ActiveStroke key={s.order} d={s.path} progress={progress} />;
            }
            // 已完成（或暂停时的当前笔）：灰色整笔；暂停在当前笔时显示深色提示
            return (
              <path
                key={s.order}
                d={s.path}
                fill="none"
                stroke={i === done ? '#222' : '#bfbfbf'}
                strokeWidth={i === done ? 58 : 52}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
        </g>
      </svg>
      <div className="player-status" data-testid="player-step">
        第 {Math.min(done + 1, total)} / {total} 笔
      </div>
      <div className="player-dots" data-testid="player-dots">
        {strokes.map((s, i) => (
          <button
            key={s.order}
            className={`dot ${i < done ? 'done' : ''} ${i === done ? 'current' : ''}`}
            data-testid="stroke-dot"
            aria-label={`第 ${i + 1} 笔`}
            onClick={() => seek(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="player-controls">
        <button onClick={toggle} data-testid="player-toggle" aria-label={playing ? '暂停' : '播放'}>
          {playing ? '⏸' : '▶'}
        </button>
        <button onClick={prev} data-testid="player-prev" aria-label="上一笔">
          ◀
        </button>
        <button onClick={next} data-testid="player-next" aria-label="下一笔">
          ▶|
        </button>
        <button onClick={reset} data-testid="player-reset" aria-label="重置">
          ⟲
        </button>
        {!compact && <span className="char-label">{char}</span>}
      </div>
      {!compact && <div className="player-hint">空格 播放/暂停 · ←→ 逐笔</div>}
    </div>
  );
}
