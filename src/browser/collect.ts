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
      'transformOrigin',
      'transformStyle',
      'perspective',
      'perspectiveOrigin',
      'backfaceVisibility',
      'willChange',
      'clipPath',
      'mask',
      'overflow',
      'zIndex',
      'translate',
      'rotate',
      'scale',
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
    const host = window as unknown as {
      __visdna?: { ids: WeakMap<Element, string>; next: number };
    };
    const state = (host.__visdna ||= { ids: new WeakMap<Element, string>(), next: 0 });
    const nodes: Element[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node: Node | null = walker.currentNode;
    while (node && nodes.length < 12000) {
      nodes.push(node as Element);
      node = walker.nextNode();
    }
    const elements = [];
    for (let index = 0; index < nodes.length && elements.length < 1800; index++) {
      const el = nodes[index]!;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH'].includes(el.tagName)) continue;
      const s = getComputedStyle(el),
        r = el.getBoundingClientRect();
      if (s.display === 'none' || s.visibility === 'hidden' || r.width < 2 || r.height < 2)
        continue;
      let id = state.ids.get(el);
      if (!id) {
        id = `e${state.next++}`;
        state.ids.set(el, id);
      }
      el.setAttribute('data-visdna-id', id);
      const relevant =
        el.children.length > 0 ||
        el.textContent?.trim() ||
        ['IMG', 'INPUT', 'BUTTON', 'HR', 'CANVAS', 'VIDEO'].includes(el.tagName);
      if (!relevant) continue;
      const styles: Record<string, string> = {};
      for (const k of keys)
        styles[k] = s[k as keyof CSSStyleDeclaration]?.toString().slice(0, 500) || '';
      // Asset URLs are not exported; gradients remain useful design evidence.
      for (const k of ['background', 'backgroundImage', 'mask', 'clipPath'])
        styles[k] = styles[k]!.replace(/url\([^)]*\)/g, 'none');
      elements.push({
        id,
        parent: el.parentElement ? state.ids.get(el.parentElement) || null : null,
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
      pageWidth: document.documentElement.scrollWidth,
      inspectedNodes: nodes.length,
      elements,
      truncated: node !== null || elements.length >= 1800,
    };
  });
}
export async function frame(page: Page, progress: number): Promise<MotionFrame> {
  const state = await page.evaluate(() => {
    const elements = [],
      sectionIds: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node: Node | null = walker.currentNode,
      inspected = 0;
    while (node && inspected++ < 12000 && elements.length < 1800) {
      const el = node as Element;
      const id = el.getAttribute('data-visdna-id');
      if (id) {
        const s = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (
          ['SECTION', 'HEADER', 'FOOTER', 'ARTICLE'].includes(el.tagName) &&
          rect.bottom > 0 &&
          rect.top < innerHeight &&
          sectionIds.length < 24
        )
          sectionIds.push(id);
        elements.push({
          id,
          y: rect.y + scrollY,
          opacity: s.opacity,
          transform: s.transform,
          filter: s.filter,
          position: s.position,
        });
      }
      node = walker.nextNode();
    }
    return { elements, sectionIds, scrollY };
  });
  return { progress, ...state };
}
