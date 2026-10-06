import { normalizeColor, tokens, spacing } from './normalize.js';
import { components } from './components.js';
import type { Capture, VisualDNAV1, Inference, Stage } from '../types.js';
export function buildRawDNA(
  capture: Capture,
  url: string,
  stage: (s: Stage) => void = () => {},
): VisualDNAV1 {
  const es = capture.desktop.elements;
  const vals = (key: string) => es.map((e) => e.styles[key]);
  stage('colors');
  const palette = tokens(
    es
      .flatMap((e) => [e.styles.color, e.styles.backgroundColor, e.styles.borderColor])
      .map((v) => normalizeColor(v || '')),
  );
  const infer = (
    value: string | null | undefined,
    confidence: number,
    evidence: string[],
  ): Inference => ({
    value: value || null,
    confidence: value ? confidence : 0,
    evidence: value ? evidence : ['Insufficient evidence; no semantic color guessed'],
  });
  const bg = tokens(vals('backgroundColor').map((v) => normalizeColor(v || '')));
  const text = tokens(
    es
      .filter((e) => e.textLength > 0 && e.children === 0)
      .map((e) => normalizeColor(e.styles.color || '')),
  );
  const button = es.find(
    (e) => e.tag === 'button' && normalizeColor(e.styles.backgroundColor || ''),
  );
  const roles: Record<string, Inference> = {
    background: infer(
      normalizeColor(es.find((e) => e.tag === 'body')?.styles.backgroundColor || ''),
      0.85,
      ['Body computed background'],
    ),
    surface: infer(bg[0]?.value, 0.55, ['Most frequent nontransparent element background']),
    'surface-secondary': infer(bg[1]?.value, 0.4, ['Second most frequent element background']),
    primary: infer(normalizeColor(button?.styles.backgroundColor || ''), 0.6, [
      'First button background',
    ]),
    'text-primary': infer(text[0]?.value, 0.75, ['Most frequent leaf text color']),
    'text-secondary': infer(text[1]?.value, 0.5, ['Second most frequent leaf text color']),
    border: infer(tokens(vals('borderColor').map((v) => normalizeColor(v || '')))[0]?.value, 0.45, [
      'Computed border color, including zero-width borders',
    ]),
  };
  for (const role of ['secondary', 'accent', 'muted', 'success', 'warning', 'danger'])
    roles[role] = infer(null, 0, []);
  stage('typography');
  const texts = es.filter((e) => e.textLength > 0 && e.children === 0);
  const sizes = tokens(texts.map((e) => e.styles.fontSize));
  const scale = [...sizes]
    .sort((a, b) => parseFloat(b.value) - parseFloat(a.value))
    .slice(0, 9)
    .map((t) => {
      const e = texts.find((e) => e.styles.fontSize === t.value)!;
      const size = parseFloat(t.value);
      return {
        role:
          size >= 56
            ? 'Display'
            : size >= 36
              ? 'H1'
              : size >= 28
                ? 'H2'
                : size >= 24
                  ? 'H3'
                  : size >= 20
                    ? 'H4'
                    : size >= 18
                      ? 'Body Large'
                      : size >= 16
                        ? 'Body'
                        : size >= 14
                          ? 'Small'
                          : 'Caption',
        size: t.value,
        family: e.styles.fontFamily || '',
        weight: e.styles.fontWeight || '',
        lineHeight: e.styles.lineHeight || '',
        tracking: e.styles.letterSpacing || '',
      };
    });
  stage('components');
  const detected = components(es);
  const layout = es
    .filter((e) => ['grid', 'flex', 'inline-grid', 'inline-flex'].includes(e.styles.display || ''))
    .slice(0, 100)
    .map((e) => {
      const columns = e.styles.gridTemplateColumns || '';
      const count = columns === 'none' ? 0 : columns.split(' ').length;
      const pattern =
        e.tag === 'footer'
          ? 'footer multi-column'
          : e.rect.y < 900 && e.rect.height > 250
            ? e.styles.display === 'flex'
              ? 'split hero candidate'
              : 'centered hero candidate'
            : count === 3
              ? 'three-column grid'
              : count === 2
                ? 'two-column section'
                : count > 3
                  ? 'multi-column grid'
                  : 'flex layout';
      return {
        elementId: e.id,
        display: e.styles.display || '',
        columns,
        gap: e.styles.gap || '',
        alignment: `${e.styles.alignItems} / ${e.styles.justifyContent}`,
        width: Math.round(e.rect.width),
        pattern,
      };
    });
  stage('motion');
  const frameIndexes = capture.frames.map((f) => new Map(f.elements.map((e) => [e.id, e])));
  const mobileIndex = new Map(capture.mobile.elements.map((e) => [e.id, e]));
  const motion = es
    .flatMap((e) => {
      const patterns: string[] = [];
      const frames = frameIndexes.map((f) => f.get(e.id)).filter((x) => x !== undefined);
      const changed = (k: 'opacity' | 'transform' | 'filter' | 'y') =>
        new Set(frames.map((f) => f[k])).size > 1;
      if (changed('opacity')) patterns.push('fade / reveal candidate');
      if (changed('transform')) patterns.push('transform change');
      if (changed('filter')) patterns.push('blur / filter change');
      if (e.styles.position === 'sticky' || e.styles.position === 'fixed')
        patterns.push(e.styles.position);
      const animated = e.styles.animationName !== 'none' && !!e.styles.animationName;
      const transition = (e.styles.transitionDuration || '0s')
        .split(',')
        .some((v) => parseFloat(v) > 0);
      if (!patterns.length && !animated && !transition) return [];
      return [
        {
          elementId: e.id,
          transition: e.styles.transition || '',
          animation: e.styles.animation || '',
          transform: e.styles.transform || '',
          patterns,
          confidence: patterns.length ? 0.55 : 0.9,
        },
      ];
    })
    .slice(0, 100);
  const responsiveKeys = [
    'display',
    'fontSize',
    'padding',
    'gap',
    'gridTemplateColumns',
    'width',
    'flexDirection',
    'flexWrap',
  ];
  const changes = es
    .flatMap((e) => {
      const mobile = mobileIndex.get(e.id);
      if (!mobile || mobile.tag !== e.tag) return [];
      const keys = responsiveKeys.filter((k) => e.styles[k] !== mobile.styles[k]);
      return keys.length
        ? [
            {
              elementId: e.id,
              desktop: Object.fromEntries(keys.map((k) => [k, e.styles[k] || ''])),
              mobile: Object.fromEntries(keys.map((k) => [k, mobile.styles[k] || ''])),
            },
          ]
        : [];
    })
    .slice(0, 100);
  stage('building');
  return {
    schemaVersion: '1.0',
    source: {
      url,
      capturedAt: new Date().toISOString(),
      viewports: [capture.desktop.width, capture.mobile.width],
    },
    methodology: {
      sampledElements: es.length,
      truncated: capture.desktop.truncated,
      frequencyUnit: 'Occurrences in sampled computed properties, not pixel coverage',
      warnings: [
        ...capture.warnings,
        'Component, color-role and motion labels are heuristic. Unknown roles remain null.',
        'Two viewport samples do not reconstruct exact CSS breakpoints. DOM-index correspondence may shift on dynamic pages.',
        'Scroll changes may reflect elapsed-time animation, not scroll causality. Fonts are CSS declarations; actual loaded font is not verified.',
      ],
    },
    colors: { palette, roles },
    typography: {
      families: tokens(texts.map((e) => e.styles.fontFamily)),
      weights: tokens(texts.map((e) => e.styles.fontWeight)),
      sizes,
      lineHeights: tokens(texts.map((e) => e.styles.lineHeight)),
      tracking: tokens(texts.map((e) => e.styles.letterSpacing)),
      scale,
    },
    spacing: spacing(
      es.flatMap((e) =>
        [
          'paddingTop',
          'paddingBottom',
          'paddingLeft',
          'paddingRight',
          'marginTop',
          'marginBottom',
          'marginLeft',
          'marginRight',
          'rowGap',
          'columnGap',
        ].map((k) => e.styles[k] || ''),
      ),
    ),
    radius: tokens(vals('borderRadius')),
    shadows: tokens(vals('boxShadow')),
    backgrounds: tokens(vals('backgroundImage')),
    containers: tokens(
      es
        .filter((e) => e.children > 0)
        .map((e) =>
          e.styles.maxWidth !== 'none'
            ? e.styles.maxWidth
            : `${Math.round(e.rect.width / 8) * 8}px`,
        ),
    ),
    layout,
    components: detected,
    motion,
    responsive: { desktopWidth: capture.desktop.width, mobileWidth: capture.mobile.width, changes },
  };
}
