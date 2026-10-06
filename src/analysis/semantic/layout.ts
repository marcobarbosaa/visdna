import type { Snapshot, ElementSample } from '../../types.js';
import type { SemanticContext, LayoutRegion, Finding } from './types.js';
import { finding, signal, unknown } from './confidence.js';
import { title, interactive, media, px, median } from './context.js';
export function columns(e: ElementSample, ctx: SemanticContext): number | null {
  const children = (ctx.children.get(e.id) || []).filter(
    (c) => c.rect.width > 30 && c.rect.height > 20,
  );
  if (children.length < 2) return null;
  const first = children[0]!;
  const row = children
    .filter((c) => Math.abs(c.rect.y - first.rect.y) < Math.min(24, first.rect.height / 4))
    .sort((a, b) => a.rect.x - b.rect.x);
  if (row.some((c, i) => i > 0 && c.rect.x < row[i - 1]!.rect.x + row[i - 1]!.rect.width - 8))
    return null;
  return row.length;
}
export function container(snapshot: Snapshot, ctx: SemanticContext): Finding<number> {
  const candidates = ctx.elements.filter(
    (e) =>
      e.children >= 1 &&
      e.rect.width >= snapshot.width * 0.5 &&
      e.rect.width < snapshot.width - Math.max(16, snapshot.width * 0.02) &&
      e.rect.height >= 80 &&
      e.tag !== 'body' &&
      Math.abs(e.rect.x - (snapshot.width - e.rect.width) / 2) < 24,
  );
  const explicit = candidates.filter((e) => px(e.styles.maxWidth) > 0);
  const pool = explicit.length
    ? explicit
    : candidates.filter((e) => ['main', 'section', 'header'].includes(e.tag));
  if (!pool.length) return unknown<number>();
  return finding(
    Math.round(median(pool.map((e) => e.rect.width))),
    [
      signal(1, `${pool.length} centered structural containers`),
      signal(
        explicit.length ? 1 : 0.7,
        explicit.length
          ? 'Computed max-width and measured width'
          : 'Observed centered region widths; no max-width inferred',
      ),
    ],
    pool.length,
  );
}
export function analyzeLayout(
  snapshot: Snapshot,
  ctx: SemanticContext,
): {
  regions: LayoutRegion[];
  desktopContainer: Finding<number>;
  viewportWidth: number;
  pageShellWidth: number;
  contentContainerWidth: Finding<number>;
} {
  const candidates: { e: ElementSample; result: LayoutRegion }[] = [];
  let heroFound = false;
  for (const e of ctx.elements) {
    if (e.rect.width < snapshot.width * 0.45 || e.rect.height < 40) continue;
    const structural =
      ['body', 'main', 'section', 'header', 'footer', 'nav'].includes(e.tag) ||
      ['navigation', 'main', 'contentinfo'].includes(e.role);
    if (!structural && (e.children < 2 || e.rect.height < 160)) continue;
    const desc = ctx.descendants(e),
      children = ctx.children.get(e.id) || [];
    const titles = desc.filter((c) => title(c, ctx)),
      actions = desc.filter(interactive),
      images = desc.filter(media);
    const cols = columns(e, ctx);
    let type = '';
    let signals = [
      signal(1, `Structural region ${Math.round(e.rect.width)} × ${Math.round(e.rect.height)}px`),
    ];
    if (e.tag === 'body') type = 'page shell';
    else if (e.tag === 'nav' || e.role === 'navigation') type = 'navbar';
    else if (e.tag === 'footer' || e.role === 'contentinfo') type = 'footer';
    else if (e.tag === 'main' || e.role === 'main')
      type = e.rect.width >= snapshot.width - 16 ? 'page shell' : 'content container';
    else {
      const nearTop = e.rect.y >= 0 && e.rect.y < snapshot.height * 0.65;
      const prominent = titles.some(
        (t) => px(t.styles.fontSize) >= 32 && t.rect.y < e.rect.y + e.rect.height * 0.7,
      );
      const hero =
        nearTop &&
        e.rect.height >= snapshot.height * 0.28 &&
        e.rect.height <= snapshot.height * 1.5 &&
        prominent &&
        actions.length > 0;
      if (hero && !heroFound) {
        const groups = children.filter(
          (c) => c.rect.width > e.rect.width * 0.2 && c.rect.height > 80,
        );
        const split =
          groups.length === 2 &&
          Math.abs(groups[0]!.rect.y - groups[1]!.rect.y) < 80 &&
          groups[0]!.rect.x + groups[0]!.rect.width <= groups[1]!.rect.x + 24 &&
          groups.every((c) => c.rect.width / e.rect.width < 0.75);
        type = split ? 'split hero' : 'hero';
        heroFound = true;
        signals = [
          ...signals,
          signal(1, 'Near page top, substantial height, prominent heading and action'),
          signal(
            images.length ? 1 : 0.7,
            images.length ? 'Supporting media observed' : 'Heading and action hierarchy observed',
          ),
        ];
      } else if (
        ['grid', 'flex'].includes(e.styles.display || '') &&
        children.length >= 3 &&
        children.length <= 16 &&
        cols &&
        cols >= 2
      ) {
        const cards = children.filter(
          (c) =>
            c.rect.width >= 120 &&
            c.rect.height >= 80 &&
            ctx.descendants(c).some((t) => title(t, ctx)),
        );
        const sizes = new Set(
          children.map((c) => `${Math.round(c.rect.width / 40)}:${Math.round(c.rect.height / 40)}`),
        );
        if (cards.length === children.length)
          type = sizes.size >= 3 && cols && cols > 1 ? 'bento grid' : 'cards grid';
        else if (
          images.length >= children.length &&
          titles.length === 0 &&
          children.every((c) => c.rect.height < 140)
        )
          type = 'logo cloud';
        else if (titles.length >= 3) type = 'feature grid';
      } else if (
        e.tag === 'section' &&
        titles.length === 1 &&
        actions.length >= 1 &&
        desc.length < 14 &&
        e.rect.y > snapshot.height
      )
        type = 'CTA';
      if (!type && cols === 2 && e.rect.height >= 200 && titles.length) type = 'split section';
      if (!type && e.tag === 'section' && titles.length) type = 'section';
      if (!type && px(e.styles.maxWidth) > 0 && e.children >= 2) type = 'content container';
    }
    if (!type) continue;
    signals.push(signal(1, `Supported by ${e.tag} semantics and child geometry`));
    const f = finding(type, signals, 1 + titles.length + actions.length);
    if (f.value)
      candidates.push({
        e,
        result: {
          type: f.value,
          confidence: f.confidence,
          evidence: f.evidence,
          width: Math.round(e.rect.width),
          height: Math.round(e.rect.height),
          columns: cols,
          alignment:
            Math.abs(e.rect.x - (snapshot.width - e.rect.width) / 2) < 24 ? 'centered' : 'offset',
        },
      });
  }
  // Suppress same-sized wrapper duplicates; comparison bounded by the output cap.
  const regions: LayoutRegion[] = [];
  for (const { result } of candidates) {
    if (regions.length >= 32) break;
    if (
      regions.some(
        (r) =>
          r.type === result.type &&
          Math.abs(r.width - result.width) < 4 &&
          Math.abs(r.height - result.height) < 4,
      )
    )
      continue;
    regions.push(result);
  }
  const contentContainerWidth = container(snapshot, ctx);
  return {
    regions,
    desktopContainer: contentContainerWidth,
    contentContainerWidth,
    viewportWidth: snapshot.width,
    pageShellWidth: snapshot.pageWidth || snapshot.width,
  };
}
