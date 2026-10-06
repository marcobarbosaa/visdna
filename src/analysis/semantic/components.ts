import type { ElementSample } from '../../types.js';
import type { SemanticContext, ComponentFamily, VisualDNAV2, ColorFamily } from './types.js';
import { finding, signal } from './confidence.js';
import { title as isTitle, description, interactive, media, median, px } from './context.js';
import { parseColor } from './color-space.js';
import { reference, semanticRadius } from './tokens.js';
import { columns } from './layout.js';
function foreground(element: ElementSample, descendants: ElementSample[]): string {
  const weights = new Map<string, number>();
  for (const child of descendants.filter(
    (c) => c.children === 0 && c.textLength > 0 && !interactive(c),
  )) {
    const color = parseColor(child.styles.color || '')?.value;
    if (color) weights.set(color, (weights.get(color) || 0) + child.textLength);
  }
  return (
    [...weights].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ||
    parseColor(element.styles.color || '')?.value ||
    element.styles.color ||
    ''
  );
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
    { type: string; elements: ElementSample[]; desc: ElementSample[] }
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
    const key = [
      type,
      normalized(e.styles.backgroundColor || ''),
      normalized(foreground(e, desc)),
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
    const group = groups.get(key) || { type, elements: [], desc };
    group.elements.push(e);
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
        color: reference(foreground(e, desc), tokens, 'colors', [
          'textPrimary',
          'textSecondary',
          'muted',
        ]),
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
