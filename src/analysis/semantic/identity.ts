import type { SemanticContext, VisualDNAV2 } from './types.js';
import { finding, signal, unknown } from './confidence.js';
import { parseColor, contrast } from './color-space.js';
import { media, median, px, interactive } from './context.js';
import { semanticRadius } from './tokens.js';
export function radiusIdentity(ctx: SemanticContext) {
  const boxes = ctx.elements.filter(
    (e) =>
      e.rect.width > 0 &&
      e.rect.height > 0 &&
      (px(e.styles.borderRadius) > 0 ||
        ['pill', 'circle'].includes(semanticRadius(e)) ||
        interactive(e) ||
        media(e) ||
        px(e.styles.borderWidth) > 0 ||
        parseColor(e.styles.backgroundColor || '')),
  );
  const measured = boxes.filter(
    (e) =>
      ['pill', 'circle'].includes(semanticRadius(e)) ||
      /^\d+(\.\d+)?px$/.test(e.styles.borderRadius || ''),
  );
  if (measured.length < 4) return unknown<string>();
  const pills = measured.filter((e) => semanticRadius(e) === 'pill').length;
  const circles = measured.filter((e) => semanticRadius(e) === 'circle').length;
  const conventional = measured.filter(
    (e) => !['pill', 'circle'].includes(semanticRadius(e)) && px(e.styles.borderRadius) > 0,
  );
  const rounded = pills + circles + conventional.length;
  const ratios = conventional.map(
    (e) => px(e.styles.borderRadius) / Math.min(e.rect.width, e.rect.height),
  );
  const sizes = conventional.map((e) => px(e.styles.borderRadius));
  const value =
    rounded / measured.length <= 0.2
      ? 'sharp'
      : Math.max(pills, circles) >= Math.max(3, rounded * 0.35)
        ? pills >= circles
          ? 'pill-heavy'
          : 'circle-heavy'
        : !sizes.length
          ? null
          : median(sizes) <= 8 && median(ratios) < 0.15
            ? 'low-radius'
            : median(ratios) >= 0.2
              ? 'rounded'
              : 'moderately-rounded';
  return finding(
    value,
    [
      signal(
        1,
        `${pills} pill-like elements; ${circles} circular elements; ${rounded}/${measured.length} sampled boxes rounded`,
      ),
      signal(
        0.8,
        'Geometry normalized against each box; pills and circles excluded from conventional radius statistics',
      ),
      ...(sizes.length
        ? [
            signal(
              0.8,
              `Conventional radii ${Math.min(...sizes)}-${Math.max(...sizes)}px; median radius/minimum-dimension ratio ${median(ratios).toFixed(3)}`,
            ),
          ]
        : []),
      signal(
        0.8,
        `${new Set(measured.map((e) => ctx.region.get(e.id))).size} structural contexts represented`,
      ),
    ],
    measured.length,
  );
}
export function analyzeIdentity(
  ctx: SemanticContext,
  dna: Pick<VisualDNAV2, 'colors' | 'spacing' | 'layout' | 'componentFamilies'>,
): VisualDNAV2['identity'] {
  const background = dna.colors.roles.background,
    parsed = background?.value ? parseColor(background.value) : null;
  const theme = parsed
    ? finding(
        parsed.luminance < 0.18 ? 'dark' : 'light',
        [
          signal(background!.confidence, 'Dominant background role supported by page coverage'),
          signal(1, `Background relative luminance ${parsed.luminance.toFixed(3)}`),
        ],
        ctx.elements.length,
      )
    : unknown<string>();
  const component = dna.spacing.contexts.component || [],
    section = dna.spacing.contexts.section || [];
  const typical = median(component.map((v) => v.value)),
    sectionSpace = median(section.map((v) => v.value));
  const density =
    component.length >= 3 && section.length >= 2
      ? finding(
          typical <= 16 && sectionSpace <= 40
            ? 'compact'
            : typical >= 24 && sectionSpace >= 64
              ? 'spacious'
              : 'moderate',
          [
            signal(1, `Median distinct component spacing ${typical}px`),
            signal(1, `Median distinct section spacing ${sectionSpace}px`),
          ],
          component.length + section.length,
        )
      : unknown<string>();
  const characteristics: VisualDNAV2['identity']['characteristics'] = [];
  const cards = dna.componentFamilies.filter((f) => ['card', 'featureCard'].includes(f.type));
  const cardCount = cards.reduce((n, c) => n + c.instances, 0);
  if (cardCount >= 3)
    characteristics.push(
      finding(
        'card-driven',
        [
          signal(1, `${cardCount} cards in ${cards.length} repeated families`),
          signal(1, 'Repeated surface and heading anatomy'),
        ],
        cardCount,
      ),
    );
  const leaves = ctx.elements.filter((e) => e.children === 0),
    texts = leaves.filter((e) => e.textLength >= 40),
    images = ctx.elements.filter(media);
  if (leaves.length >= 10 && texts.length / leaves.length > 0.6)
    characteristics.push(
      finding(
        'text-heavy',
        [
          signal(1, `${texts.length}/${leaves.length} leaves have at least 40 text characters`),
          signal(1, 'Text length measured without exporting content'),
        ],
        texts.length,
      ),
    );
  const imageArea = images.reduce((n, e) => n + e.rect.width * e.rect.height, 0),
    body = ctx.elements.find((e) => e.tag === 'body');
  if (body && images.length >= 3 && imageArea / (body.rect.width * body.rect.height) > 0.45)
    characteristics.push(
      finding(
        'image-heavy',
        [
          signal(1, `${images.length} media boxes`),
          signal(0.7, 'Media bounding boxes exceed 45% of page area; overlap is approximate'),
        ],
        images.length,
      ),
    );
  const data = ctx.elements.filter((e) => ['td', 'th'].includes(e.tag));
  if (data.length >= 20)
    characteristics.push(
      finding(
        'data-dense',
        [signal(1, `${data.length} table cells`), signal(1, 'Tabular structure observed')],
        data.length,
      ),
    );
  const radius = radiusIdentity(ctx);
  if (radius.value) characteristics.push(radius);
  if (dna.layout.desktopContainer.value)
    characteristics.push(
      finding(
        'centered',
        [
          signal(dna.layout.desktopContainer.confidence, 'Centered structural containers'),
          signal(1, `Typical width ${dna.layout.desktopContainer.value}px`),
        ],
        4,
      ),
    );
  const text = dna.colors.roles.textPrimary?.value
    ? parseColor(dna.colors.roles.textPrimary.value)
    : null;
  if (parsed && text)
    characteristics.push(
      finding(
        contrast(parsed, text) >= 7 ? 'high contrast' : 'moderate contrast',
        [
          signal(1, `Primary text/background contrast ${contrast(parsed, text).toFixed(2)}:1`),
          signal(
            dna.colors.roles.textPrimary!.confidence,
            'Measured dominant text role; not an accessibility audit',
          ),
        ],
        4,
      ),
    );
  const chromaticCoverage = dna.colors.palette
    .filter((c) => c.chroma >= 0.055)
    .reduce((n, c) => n + c.visualCoverageEstimate, 0);
  if (parsed && dna.colors.roles.accent?.value)
    characteristics.push(
      finding(
        chromaticCoverage < 20 ? 'restrained color usage' : 'vivid color usage',
        [
          signal(1, `${chromaticCoverage.toFixed(1)}% estimated chromatic background coverage`),
          signal(dna.colors.roles.accent.confidence, 'Repeated chromatic accents'),
        ],
        4,
      ),
    );
  return { theme, density, characteristics };
}
export function summarize(dna: Omit<VisualDNAV2, 'designSummary'>): Record<string, string> {
  const result: Record<string, string> = {};
  if (dna.identity.theme.value)
    result.theme = `${dna.identity.theme.value === 'dark' ? 'Dark' : 'Light'} interface${dna.identity.density.value ? ` with ${dna.identity.density.value} spacing density` : ''}.`;
  if (dna.layout.desktopContainer.value)
    result.layout = `Centered content with an observed desktop container around ${dna.layout.desktopContainer.value}px.`;
  const cards = dna.componentFamilies.filter((f) => ['card', 'featureCard'].includes(f.type));
  if (cards.length)
    result.components = `${cards.reduce((n, c) => n + c.instances, 0)} repeated cards form ${cards.length} component ${cards.length === 1 ? 'family' : 'families'}.`;
  const body = dna.typography.roles.body?.value;
  if (body?.family)
    result.typography = `${body.family} declared for body text at ${body.size}${dna.typography.personality.headingContrast?.value ? `, with ${dna.typography.personality.headingContrast.value} heading contrast` : ''}.`;
  if (dna.colors.roles.primary?.value)
    result.colorUsage = `Repeated actions use ${dna.colors.roles.primary.value}${dna.colors.roles.accent?.value && dna.colors.roles.accent.value !== dna.colors.roles.primary.value ? `; emphasized accents use ${dna.colors.roles.accent.value}` : ''}.`;
  else if (dna.colors.roles.accent?.value)
    result.colorUsage = `Repeated chromatic accents use ${dna.colors.roles.accent.value}.`;
  if (dna.spacing.baseUnit.value)
    result.spacing = `Observed spacing aligns primarily to a ${dna.spacing.baseUnit.value}px unit.`;
  if (dna.responsive.layoutChanges.length)
    result.responsive =
      dna.responsive.layoutChanges
        .map((f) => f.value)
        .filter(Boolean)
        .join('; ') + '.';
  if (dna.motion.patterns.length)
    result.motion = `${dna.motion.patterns.length} grouped motion or positioning patterns; declarations and observed changes are distinguished.`;
  if (
    dna.motion.patterns.some(
      (p) =>
        p.type === 'persistent-scroll-visual' &&
        p.confidence >= 0.7 &&
        p.evidence.some((e) => {
          const m = e.match(/across (\d+) checkpoints and (\d+) regions/);
          return m && Number(m[1]) >= 3 && Number(m[2]) >= 2;
        }),
    )
  )
    result.persistentScroll =
      'A persistent visual was observed across multiple scroll regions; scroll causality is not established.';
  return result;
}
