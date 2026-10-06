import type { Page } from 'playwright';
import type { Snapshot, MotionFrame } from '../types.js';
export async function collect(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const keys = [
      'color',
      'background',
      'backgroundColor',
      'backgroundImage',
      'fontFamily',
      'fontSize',
      'fontWeight',
      'fontStyle',
      'lineHeight',
      'letterSpacing',
      'textTransform',
      'display',
      'flexDirection',
      'flexWrap',
      'position',
      'width',
      'height',
      'maxWidth',
      'minWidth',
      'margin',
      'marginTop',
      'marginBottom',
      'marginLeft',
      'marginRight',
      'padding',
      'paddingTop',
      'paddingBottom',
      'paddingLeft',
      'paddingRight',
      'gap',
      'rowGap',
      'columnGap',
      'border',
      'borderColor',
      'borderWidth',
      'borderRadius',
      'boxShadow',
      'opacity',
      'filter',
      'backdropFilter',
      'transform',
      'transition',
      'transitionDuration',
      'transitionProperty',
      'transitionTimingFunction',
      'animation',
      'animationName',
      'animationDuration',
      'animationTimingFunction',
      'gridTemplateColumns',
      'alignItems',
      'justifyContent',
    ];
    const nodes = Array.from(document.querySelectorAll('body,body *')).slice(0, 12000);
    const elements = [];
    for (let index = 0; index < nodes.length && elements.length < 1800; index++) {
      const el = nodes[index]!;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH'].includes(el.tagName)) continue;
      const s = getComputedStyle(el),
        r = el.getBoundingClientRect();
      if (s.display === 'none' || s.visibility === 'hidden' || r.width < 2 || r.height < 2)
        continue;
      const id = `e${index}`;
      el.setAttribute('data-visdna-id', id);
      const relevant =
        el.children.length > 0 ||
        el.textContent?.trim() ||
        ['IMG', 'INPUT', 'BUTTON', 'HR'].includes(el.tagName);
      if (!relevant) continue;
      const styles: Record<string, string> = {};
      for (const k of keys)
        styles[k] = s[k as keyof CSSStyleDeclaration]?.toString().slice(0, 500) || '';
      // Asset URLs are not exported; gradients remain useful design evidence.
      for (const k of ['background', 'backgroundImage'])
        styles[k] = styles[k]!.replace(/url\([^)]*\)/g, 'none');
      elements.push({
        id,
        parent: el.parentElement?.getAttribute('data-visdna-id') || null,
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || '',
        children: el.children.length,
        textLength: Math.min(el.textContent?.trim().length || 0, 10000),
        rect: { x: r.x, y: r.y + scrollY, width: r.width, height: r.height },
        styles,
      });
    }
    return {
      width: innerWidth,
      height: innerHeight,
      pageHeight: document.documentElement.scrollHeight,
      elements,
      truncated: document.querySelectorAll('body *').length > 12000 || elements.length >= 1800,
    };
  });
}
export async function frame(page: Page, progress: number): Promise<MotionFrame> {
  return {
    progress,
    elements: await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-visdna-id]'))
        .slice(0, 1800)
        .map((el) => {
          const s = getComputedStyle(el);
          return {
            id: el.getAttribute('data-visdna-id')!,
            y: el.getBoundingClientRect().y + scrollY,
            opacity: s.opacity,
            transform: s.transform,
            filter: s.filter,
            position: s.position,
          };
        }),
    ),
  };
}
