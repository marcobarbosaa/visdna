import type { SemanticContext, TypeStyle, VisualDNAV2 } from './types.js';
import { finding, signal, unknown } from './confidence.js';
import { title, actionContext, median, px } from './context.js';
export function analyzeTypography(ctx: SemanticContext): VisualDNAV2['typography'] {
  const texts = ctx.elements.filter(
    (e) =>
      e.textLength > 0 && (e.children === 0 || /^h[1-4]$/.test(e.tag)) && px(e.styles.fontSize) > 0,
  );
  const isHeading = (e: (typeof texts)[number]) =>
    title(e, ctx) || (e.parent ? title(ctx.byId.get(e.parent) || e, ctx) : false);
  const bodySizes = texts
    .filter((e) => !isHeading(e) && !actionContext(e, ctx) && e.textLength >= 40)
    .map((e) => px(e.styles.fontSize));
  const base = median(bodySizes) || 16;
  const groups = new Map<string, typeof texts>();
  for (const e of texts) {
    const size = px(e.styles.fontSize);
    let role: string;
    if (e.tag === 'label' || actionContext(e, ctx)) role = 'label';
    else if (e.tag === 'figcaption' || e.tag === 'caption') role = 'caption';
    else if (isHeading(e))
      role =
        size >= Math.max(48, base * 3)
          ? 'display'
          : e.tag === 'h1'
            ? 'h1'
            : e.tag === 'h2'
              ? 'h2'
              : e.tag === 'h3'
                ? 'h3'
                : e.tag === 'h4'
                  ? 'h4'
                  : size >= base * 2
                    ? 'h1'
                    : size >= base * 1.5
                      ? 'h2'
                      : size >= base * 1.3
                        ? 'h3'
                        : 'h4';
    else
      role =
        size >= base * 1.15
          ? 'bodyLarge'
          : size < base * 0.8
            ? 'caption'
            : size < base
              ? 'small'
              : 'body';
    const list = groups.get(role) || [];
    list.push(e);
    groups.set(role, list);
  }
  const roles: VisualDNAV2['typography']['roles'] = Object.fromEntries(
    ['display', 'h1', 'h2', 'h3', 'h4', 'bodyLarge', 'body', 'small', 'caption', 'label'].map(
      (r) => [r, unknown<TypeStyle>()],
    ),
  );
  for (const [role, list] of groups) {
    const signatures = new Map<string, typeof texts>();
    for (const e of list) {
      const key = [
        e.styles.fontFamily,
        e.styles.fontSize,
        e.styles.fontWeight,
        e.styles.lineHeight,
        e.styles.letterSpacing,
      ].join('|');
      const group = signatures.get(key) || [];
      group.push(e);
      signatures.set(key, group);
    }
    const dominant = [...signatures.values()].sort(
      (a, b) => b.length - a.length || a[0]!.styles.fontSize!.localeCompare(b[0]!.styles.fontSize!),
    )[0]!;
    const e = dominant[0]!;
    roles[role] = finding(
      {
        family: e.styles.fontFamily || '',
        size: e.styles.fontSize || '',
        weight: e.styles.fontWeight || '',
        lineHeight: e.styles.lineHeight || '',
        tracking: e.styles.letterSpacing || '',
      },
      [
        signal(
          dominant.length / list.length,
          `${dominant.length}/${list.length} role samples share a complete typographic signature`,
        ),
        signal(1, `Size relative to ${base}px body median and structural text context`),
      ],
      dominant.length,
    );
  }
  const headingSizes = texts.filter(isHeading).map((e) => px(e.styles.fontSize));
  const lineRatios = texts
    .filter((e) => !isHeading(e) && !actionContext(e, ctx) && px(e.styles.lineHeight) > 0)
    .map((e) => px(e.styles.lineHeight) / px(e.styles.fontSize));
  const weights = texts
    .map((e) => Number(e.styles.fontWeight))
    .filter((n) => Number.isFinite(n) && n > 0);
  const personality: VisualDNAV2['typography']['personality'] = {
    density: unknown<string>(),
    headingContrast: unknown<string>(),
    weightUsage: unknown<string>(),
  };
  if (lineRatios.length >= 3)
    personality.density = finding(
      median(lineRatios) < 1.4 ? 'compact' : median(lineRatios) > 1.7 ? 'spacious' : 'moderate',
      [
        signal(1, `Median body line-height ratio ${median(lineRatios).toFixed(2)}`),
        signal(1, `${lineRatios.length} measured body line heights`),
      ],
      lineRatios.length,
    );
  if (headingSizes.length && bodySizes.length)
    personality.headingContrast = finding(
      Math.max(...headingSizes) / base >= 2.5
        ? 'high'
        : Math.max(...headingSizes) / base >= 1.5
          ? 'moderate'
          : 'low',
      [
        signal(1, `Largest heading/body ratio ${(Math.max(...headingSizes) / base).toFixed(2)}`),
        signal(1, 'Heading and body contexts both observed'),
      ],
      texts.length,
    );
  if (weights.length >= 3)
    personality.weightUsage = finding(
      median(weights) >= 600 ? 'medium-heavy' : median(weights) <= 400 ? 'regular-light' : 'medium',
      [
        signal(1, `Median declared weight ${median(weights)}`),
        signal(1, `${weights.length} numeric font weights`),
      ],
      weights.length,
    );
  return { roles, personality };
}
