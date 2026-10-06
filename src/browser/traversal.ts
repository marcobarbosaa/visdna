import type { Page } from 'playwright';
import type { Snapshot, TraversalCoverage } from '../types.js';

export const CAPTURE_LIMITS = {
  desktopCheckpoints: 20,
  mobileCheckpoints: 6,
  elements: 1800,
  desktopMs: 24000,
  mobileMs: 7000,
  screenshotBytes: 24 * 1024 * 1024,
  canvasPerCheckpoint: 3,
  visualSamples: 120,
} as const;

export function nextCheckpoint(y: number, height: number, viewport: number, remaining: number) {
  const bottom = Math.max(0, height - viewport);
  // Minimum five samples for short pages; viewport distances until the checkpoint budget requires gaps.
  const step = Math.max(
    Math.min(viewport * 0.9, bottom / 4),
    (bottom - y) / Math.max(1, remaining),
  );
  return Math.min(bottom, Math.ceil(y + Math.max(1, step)));
}
export function intervalCoverage(intervals: [number, number][], height: number): number {
  let end = 0,
    total = 0;
  for (const [a, b] of [...intervals].sort((a, b) => a[0] - b[0])) {
    const right = Math.min(height, b),
      left = Math.max(0, a, end);
    total += Math.max(0, right - left);
    end = Math.max(end, right);
  }
  return height > 0 ? Math.min(1, total / height) : 0;
}
export function coverage(
  checkpoints: number[],
  snapshot: Snapshot,
  stopReason: TraversalCoverage['stopReason'],
): TraversalCoverage {
  const observedTo = checkpoints.length
    ? Math.min(snapshot.pageHeight, Math.max(0, ...checkpoints) + snapshot.height)
    : 0;
  return {
    observedFrom: checkpoints[0] || 0,
    observedTo,
    coverage: intervalCoverage(
      checkpoints.map((y) => [y, y + snapshot.height]),
      snapshot.pageHeight,
    ),
    reachedBottom: stopReason === 'bottom',
    checkpoints,
    stopReason,
  };
}
export function mergeSnapshot(base: Snapshot, update: Snapshot): Snapshot {
  const merged = new Map(base.elements.map((e) => [e.id, e]));
  let truncated = base.truncated || update.truncated;
  for (const e of update.elements) {
    const old = merged.get(e.id);
    // Preserve canonical geometry/styles; reveal states can replace an initially invisible sample.
    if (old) {
      if (old.styles.opacity === '0' && e.styles.opacity !== '0') merged.set(e.id, e);
    } else if (merged.size < CAPTURE_LIMITS.elements) merged.set(e.id, e);
    else truncated = true;
  }
  return { ...update, elements: [...merged.values()], truncated };
}
export async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 160);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            clearTimeout(timer);
            resolve();
          }),
        );
      }),
  );
  await page.waitForTimeout(100);
}
