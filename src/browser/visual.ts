import type { Page } from 'playwright';
import type { VisualState } from '../types.js';
import { CAPTURE_LIMITS } from './traversal.js';

export function visualDifference(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  return a.reduce((sum, v, i) => sum + Math.abs(v - b[i]!), 0) / (a.length * 255);
}
// Decode browser screenshots on an isolated, offline page; source canvas pixels need not be readable.
export async function visualStates(
  page: Page,
  decoder: Page,
  checkpoint: number,
  phase: VisualState['phase'],
  deadline = Infinity,
): Promise<VisualState[]> {
  const regions = await page.evaluate((limit) => {
    const result = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node: Node | null = walker.currentNode,
      visited = 0;
    const sections: string[] = [];
    while (node && visited++ < 12000) {
      const e = node as Element,
        r = e.getBoundingClientRect();
      if (
        ['SECTION', 'HEADER', 'FOOTER', 'ARTICLE'].includes(e.tagName) &&
        r.bottom > 0 &&
        r.top < innerHeight
      )
        sections.push(e.getAttribute('data-visdna-id') || '');
      if (e.tagName === 'CANVAS' && result.length < limit) {
        const s = getComputedStyle(e);
        const x = Math.max(0, r.x),
          y = Math.max(0, r.y);
        const width = Math.min(innerWidth, r.right) - x,
          height = Math.min(innerHeight, r.bottom) - y;
        if (
          width >= 8 &&
          height >= 8 &&
          s.visibility !== 'hidden' &&
          s.display !== 'none' &&
          Number(s.opacity) > 0
        )
          result.push({
            id: e.getAttribute('data-visdna-id') || '',
            rect: { x, y, width, height },
            position: s.position,
            zIndex: s.zIndex,
            opacity: s.opacity,
            transform: s.transform,
            scrollY,
          });
      }
      node = walker.nextNode();
    }
    return result
      .filter((r) => r.id)
      .map((r) => ({ ...r, sectionIds: sections.filter(Boolean).slice(0, 12) }));
  }, CAPTURE_LIMITS.canvasPerCheckpoint);
  const result: VisualState[] = [];
  for (const region of regions) {
    if (Date.now() + 300 >= deadline) break;
    let signature: number[] | null = null;
    try {
      const image = await page.screenshot({
        type: 'png',
        clip: region.rect,
        timeout: Math.min(1500, deadline - Date.now()),
      });
      signature = await decoder.evaluate(async (base64) => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + base64;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0, 16, 16);
        return Array.from(ctx.getImageData(0, 0, 16, 16).data).filter((_, i) => i % 4 !== 3);
      }, image.toString('base64'));
    } catch {
      /* Clipped/detached/slow regions remain explicit unobserved evidence. */
    }
    result.push({
      ...region,
      type: 'canvas',
      checkpoint,
      phase,
      signature,
      visualStateObserved: signature !== null,
    });
  }
  return result;
}
