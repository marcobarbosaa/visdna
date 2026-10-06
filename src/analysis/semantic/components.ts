import type { ElementSample } from '../../types.js';
import type { SemanticContext, ComponentFamily, VisualDNAV2, ColorFamily } from './types.js';
import { finding, signal, POLICY } from './confidence.js';
import { title as isTitle, description, interactive, media, median, px } from './context.js';
import { parseColor, contrast } from './color-space.js';
import { reference, semanticRadius } from './tokens.js';
import { columns } from './layout.js';
export function componentForeground(
  element: ElementSample,
  descendants: ElementSample[],
  ctx: SemanticContext,
): string {
  const surface = parseColor(element.styles.backgroundColor || '');
  const candidates: { color: string; weight: number; nestedSurface: boolean; legible: boolean }[] =
    [];
  for (const child of [element, ...descendants]) {
    // textLength includes descendants: use leaves to avoid counting wrapper text twice.
    if (
      child.children > 0 ||
      (child.textLength <= 0 && !['input', 'textarea', 'select'].includes(child.tag)) ||
      child.rect.width <= 0 ||
      child.rect.height <= 0
    )
      continue;
    const color = parseColor(child.styles.color || '');
    if (!color || color.alpha < 0.1) continue;
    let current: ElementSample | undefined = child;
    let background = surface;
    let foundBackground = false;
    let visible = true;
    let action = false;
    for (let depth = 0; current && depth < POLICY.maxAncestors; depth++) {
      if (
        current.styles.display === 'none' ||
        ['hidden', 'collapse'].includes(current.styles.visibility || '') ||
        Number(current.styles.opacity ?? 1) <= 0
      )
        visible = false;
      action ||= interactive(current);
      const local = parseColor(current.styles.backgroundColor || '');
      if (!foundBackground && local) {
        background = local;
        foundBackground = true;
      }
      if (current.id === element.id) break;
      current = current.parent ? ctx.byId.get(current.parent) : undefined;
    }
    if (!visible || current?.id !== element.id) continue;
    candidates.push({
      color: color.value,
      weight:
        Math.min(160, Math.max(1, child.textLength)) *
        (isTitle(child, ctx) ? 1.5 : 1) *
        (action && !interactive(element) ? 0.5 : 1),
      nestedSurface: !!background && background.value !== surface?.value,
      // Contrast is only a tie-breaking safeguard on known opaque local surfaces.
      legible:
        !background ||
        background.alpha < 1 ||
        color.alpha < 1 ||
        contrast(color, background) >= 1.5,
    });
  }
  const mainText = candidates.filter((c) => !c.nestedSurface && c.legible);
  const pool = mainText.length
    ? mainText
    : candidates.some((c) => c.legible)
      ? candidates.filter((c) => c.legible)
      : candidates;
  const weights = new Map<string, number>();
  for (const c of pool) weights.set(c.color, (weights.get(c.color) || 0) + c.weight);
  return [...weights].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || '';
}
export function analyzeComponents(
  ctx: SemanticContext,
  tokens: VisualDNAV2['tokens'],
  palette: ColorFamily[] = [],
): ComponentFamily[] {
  const colorFamilies = new Map(
    palette.flatMap((c) => c.members.map((m) => [m, c.value] as const)),
  );
  const groups = new Map<
    string,
    {
      type: string;
      elements: ElementSample[];
      desc: ElementSample[];
      foregrounds: Map<string, number>;
    }
  >();
  for (const e of ctx.elements) {
    let type = '';
    let desc: ElementSample[] = [];
    if (e.tag === 'button' || e.role === 'button') type = 'button';
    else if (['input', 'select', 'textarea'].includes(e.tag)) type = 'input';
    else if (e.tag === 'form') type = 'form';
    else if (e.tag === 'details') type = 'FAQ';
    else if (
      ['article', 'div', 'li'].includes(e.tag) &&
      e.children > 0 &&
      e.children < 12 &&
      e.rect.width >= 140 &&
      e.rect.width < 800 &&
      e.rect.height >= 80 &&
      e.rect.height < 700
    ) {
      desc = ctx.descendants(e);
      const background = parseColor(e.styles.backgroundColor || '');
      if (
        desc.some((c) => isTitle(c, ctx)) &&
        (background || px(e.styles.borderWidth) > 0 || px(e.styles.borderRadius) > 0)
      )
        type = 'card';
    }
    if (!type) continue;
    if (!desc.length) desc = ctx.descendants(e);
    const structure = [
      desc.some((c) => isTitle(c, ctx)),
      desc.some(media),
      desc.some(interactive),
      desc.some((c) => description(c, ctx)),
    ];
    const normalized = (v: string) => {
      const value = parseColor(v)?.value || v;
      return colorFamilies.get(value) || value;
    };
    const foreground = componentForeground(e, desc, ctx);
    const key = [
      type,
      normalized(e.styles.backgroundColor || ''),
      normalized(foreground),
      normalized(e.styles.borderColor || ''),
      e.styles.borderRadius,
      e.styles.padding,
      e.styles.boxShadow,
      e.styles.display,
      e.styles.fontSize,
      e.styles.fontWeight,
      structure.join(','),
      Math.round(e.rect.width / 32),
      Math.round(e.rect.height / 32),
    ].join('|');
    const group = groups.get(key) || {
      type,
      elements: [],
      desc,
      foregrounds: new Map<string, number>(),
    };
    group.elements.push(e);
    if (foreground) group.foregrounds.set(foreground, (group.foregrounds.get(foreground) || 0) + 1);
    groups.set(key, group);
  }
  const result: ComponentFamily[] = [];
  for (const group of groups.values()) {
    const { elements, desc } = group;
    const e = elements[0]!;
    if (group.type === 'card' && elements.length < 2) continue;
    const image = desc.find(media),
      title = desc.find((c) => isTitle(c, ctx));
    const feature =
      group.type === 'card' &&
      !!title &&
      desc.some((c) => description(c, ctx)) &&
      !!image &&
      image.rect.width <= 128 &&
      image.rect.height <= 128;
    const type = feature ? 'featureCard' : group.type;
    const f = finding(
      type,
      [
        signal(1, `${elements.length} instances share anatomy, dimensions and style signature`),
        signal(
          1,
          group.type === 'card'
            ? 'Repeated bounded surface with heading'
            : 'Explicit element semantics',
        ),
      ],
      elements.length,
    );
    if (!f.value) continue;
    const parent = e.parent ? ctx.byId.get(e.parent) : undefined;
    const cols = parent ? columns(parent, ctx) : null;
    const background =
      parseColor(e.styles.backgroundColor || '')?.value || e.styles.backgroundColor || '';
    const padding = e.styles.padding || '';
    const foreground = [...group.foregrounds].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0]?.[0];
    const uniform = /^\d+(\.\d+)?px$/.test(padding);
    result.push({
      componentFamily: `${type}-${result.filter((r) => r.type === type).length + 1}`,
      type,
      instances: elements.length,
      confidence: f.confidence,
      evidence: f.evidence,
      dimensions: {
        typicalWidth: Math.round(median(elements.map((c) => c.rect.width))),
        typicalHeight: Math.round(median(elements.map((c) => c.rect.height))),
      },
      structure: {
        media: image
          ? title && image.rect.x + image.rect.width <= title.rect.x + 8
            ? 'left'
            : title && image.rect.y < title.rect.y
              ? 'top'
              : 'inline'
          : null,
        content:
          image && title && image.rect.x + image.rect.width <= title.rect.x + 8 ? 'right' : 'flow',
        hasTitle: !!title,
        hasDescription: desc.some((c) => description(c, ctx)),
        hasAction: desc.some(interactive),
      },
      visualStyle: {
        background: reference(background, tokens, 'colors', ['surface', 'background', 'primary']),
        ...(foreground
          ? {
              color: reference(foreground, tokens, 'colors', [
                'textPrimary',
                'textSecondary',
                'muted',
              ]),
            }
          : {}),
        border: reference(
          px(e.styles.borderWidth) > 0
            ? parseColor(e.styles.borderColor || '')?.value || e.styles.borderColor || ''
            : 'none',
          tokens,
          'colors',
          ['border'],
        ),
        radius: reference(semanticRadius(e), tokens, 'radius'),
        padding: reference(uniform ? parseFloat(padding) : padding, tokens, 'spacing'),
        shadow: reference(e.styles.boxShadow || 'none', tokens, 'shadows'),
      },
      group: {
        count: elements.filter((c) => c.parent === e.parent).length,
        layout: cols ? `${cols}-column` : 'flow',
      },
    });
  }
  return result.sort((a, b) => b.instances - a.instances).slice(0, 40);
}
