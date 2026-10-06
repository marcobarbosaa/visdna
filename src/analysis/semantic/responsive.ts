import type { Capture } from '../../types.js';
import type { VisualDNAV2 } from './types.js';
import { context, heading, median, px } from './context.js';
import { columns, container } from './layout.js';
import { finding, signal } from './confidence.js';
export function analyzeResponsive(capture: Capture): VisualDNAV2['responsive'] {
  const desktop = context(capture.desktop.elements),
    mobile = context(capture.mobile.elements);
  const changes = new Map<string, number>();
  const headingRatios: number[][] = [],
    bodyRatios: number[][] = [];
  let matched = 0;
  for (const e of desktop.elements) {
    const m = mobile.byId.get(e.id);
    if (!m || m.tag !== e.tag || m.parent !== e.parent || m.role !== e.role) continue;
    matched++;
    const dcols = columns(e, desktop),
      mcols = columns(m, mobile);
    let change = '';
    if (dcols && mcols && dcols > mcols && e.rect.width > capture.desktop.width * 0.4)
      change = `${dcols}-column groups become ${mcols}-column`;
    else if (
      e.styles.flexDirection === 'row' &&
      m.styles.flexDirection === 'column' &&
      e.children >= 2
    )
      change = 'Horizontal groups stack vertically';
    if (change) changes.set(change, (changes.get(change) || 0) + 1);
    if (
      e.textLength > 0 &&
      (e.children === 0 || heading(e)) &&
      px(e.styles.fontSize) > px(m.styles.fontSize) &&
      px(m.styles.fontSize) > 0
    )
      (heading(e) ? headingRatios : bodyRatios).push([
        px(e.styles.fontSize),
        px(m.styles.fontSize),
      ]);
  }
  const typography: VisualDNAV2['responsive']['typography'] = {};
  for (const [key, pairs] of [
    ['headingReduction', headingRatios],
    ['bodyReduction', bodyRatios],
  ] as const)
    if (pairs.length)
      typography[key] = finding(
        `${median(pairs.map((p) => p[0]!))}px → ${median(pairs.map((p) => p[1]!))}px`,
        [
          signal(1, `${pairs.length} matched text elements shrink`),
          signal(1, 'Median sizes across the two observed states'),
        ],
        pairs.length,
      );
  return {
    observedViewports: [capture.desktop.width, capture.mobile.width],
    desktopContainer: container(capture.desktop, desktop),
    mobileContainer: container(capture.mobile, mobile),
    matchedElements: matched,
    layoutChanges: [...changes].map(([v, n]) =>
      finding(
        v,
        [
          signal(1, `${n} matched structural groups`),
          signal(1, 'Child geometry or flex direction changes across observed viewports'),
        ],
        n,
      ),
    ),
    typography,
    limitation:
      'Two observed viewport states only; exact breakpoints are unknown. DOM-index matches may drift on dynamic pages.',
  };
}
