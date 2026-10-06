import type { ElementSample } from '../../types.js';
import type { SemanticContext } from './types.js';
import { POLICY } from './confidence.js';
export const px = (v: string | undefined) => (v && /^-?[\d.]+px$/.test(v) ? parseFloat(v) : 0);
export const median = (ns: number[]) => {
  const a = [...ns].sort((a, b) => a - b);
  return a.length ? a[Math.floor(a.length / 2)]! : 0;
};
export const interactive = (e: ElementSample) =>
  ['button', 'a', 'input', 'select', 'textarea'].includes(e.tag) ||
  ['button', 'link'].includes(e.role);
export const heading = (e: ElementSample) =>
  /^h[1-4]$/.test(e.tag) ||
  e.role === 'heading' ||
  (e.textLength > 0 &&
    e.children <= 1 &&
    px(e.styles.fontSize) >= 28 &&
    Number(e.styles.fontWeight) >= 600);
export const media = (e: ElementSample) =>
  ['img', 'video', 'canvas', 'svg', 'picture'].includes(e.tag);
export function title(e: ElementSample, ctx: SemanticContext): boolean {
  if (heading(e)) return true;
  if (
    e.children > 0 ||
    e.textLength < 1 ||
    e.textLength > 120 ||
    px(e.styles.fontSize) < 18 ||
    Number(e.styles.fontWeight) < 500 ||
    interactive(e)
  )
    return false;
  const siblings = (e.parent ? ctx.children.get(e.parent) || [] : []).slice(
    0,
    POLICY.maxDescendants,
  );
  return siblings.some(
    (s) =>
      s.id !== e.id &&
      s.textLength > e.textLength &&
      px(s.styles.fontSize) < px(e.styles.fontSize) &&
      s.rect.y >= e.rect.y + e.rect.height - 4,
  );
}
export const description = (e: ElementSample, ctx: SemanticContext) =>
  e.tag === 'p' || (e.children === 0 && e.textLength >= 40 && !title(e, ctx) && !interactive(e));
export function actionContext(e: ElementSample, ctx: SemanticContext): ElementSample | undefined {
  let current: ElementSample | undefined = e;
  for (let i = 0; current && i < 4; i++) {
    if (interactive(current)) return current;
    current = current.parent ? ctx.byId.get(current.parent) : undefined;
  }
  return undefined;
}
export function context(elements: ElementSample[]): SemanticContext {
  const visible = elements.filter((e) => e.styles.opacity !== '0' && e.styles.display !== 'none');
  const byId = new Map(visible.map((e) => [e.id, e]));
  const children = new Map<string, ElementSample[]>();
  for (const e of visible)
    if (e.parent) {
      const list = children.get(e.parent) || [];
      list.push(e);
      children.set(e.parent, list);
    }
  const region = new Map<string, string>();
  const pageWidth = Math.max(1, ...visible.map((e) => e.rect.width));
  const pageHeight = Math.max(1, ...visible.map((e) => e.rect.y + e.rect.height));
  for (const e of visible) {
    let current: ElementSample | undefined = e;
    let key = e.parent || e.id;
    for (let depth = 0; current && depth < POLICY.maxAncestors; depth++) {
      if (['section', 'header', 'footer', 'nav', 'article'].includes(current.tag)) {
        key = current.id;
        break;
      }
      if (
        current.tag !== 'body' &&
        current.children >= 2 &&
        current.rect.width >= pageWidth * 0.45 &&
        current.rect.height >= 60 &&
        current.rect.height < pageHeight * 0.55
      ) {
        key = current.id;
        break;
      }
      if (current.parent && byId.get(current.parent)?.tag === 'body') key = current.id;
      current = current.parent ? byId.get(current.parent) : undefined;
    }
    region.set(e.id, key);
  }
  return {
    elements: visible,
    byId,
    children,
    region,
    descendants(e) {
      const result: ElementSample[] = [];
      const queue = [...(children.get(e.id) || [])];
      const seen = new Set([e.id]);
      for (let i = 0; i < queue.length && result.length < POLICY.maxDescendants; i++) {
        const child = queue[i]!;
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        result.push(child);
        queue.push(...(children.get(child.id) || []));
      }
      return result;
    },
  };
}
