import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { buildAnalysis, buildDNA } from '../src/analysis/dna.js';
import { parseColor, colorDistance } from '../src/analysis/semantic/color-space.js';
import { clusterColors } from '../src/analysis/semantic/colors.js';
import { finding, signal } from '../src/analysis/semantic/confidence.js';
import { analyzeSpacing } from '../src/analysis/semantic/spacing.js';
import { context } from '../src/analysis/semantic/context.js';
import { ResourceWarnings, isMainDocument, mainDocumentError } from '../src/browser/warnings.js';
import { semanticFixture, element } from './semantic-fixture.js';

test('modern color normalization compares equivalent colors in OKLab and preserves alpha', () => {
  for (const value of [
    '#f00',
    'rgb(255 0 0)',
    'rgb(100% 0% 0%)',
    'hsl(0 100% 50%)',
    'hsl(1turn 100% 50%)',
    'color(srgb 1 0 0)',
    'color(srgb-linear 1 0 0)',
    'oklch(0.62795536 0.25768331 29.233885)',
    'lab(54.2905% 80.8049 69.891)',
  ]) {
    const parsed = parseColor(value);
    assert(parsed, value);
    assert(colorDistance(parsed, parseColor('#ff0000')!) < 0.001, value);
  }
  assert.equal(parseColor('#1234')?.value, '#11223344');
  assert.equal(parseColor('rgba(1, 2, 3, .5)')?.value, '#01020380');
  assert.equal(parseColor('rgb(300 0 0)'), null);
  assert.equal(parseColor('color(unknown 1 0 0)'), null);
  assert.equal(parseColor('rgb(0 0 0 / 0)'), null);
  assert.equal(parseColor('hsl(nan 20% 40%)'), null);
  assert.equal(parseColor('url(secret)'), null);
  assert(parseColor('color(display-p3 1 0 0)')!.chroma > parseColor('#f00')!.chroma);
});
test('perceptual clustering groups close neutrals without merging accent or alpha', () => {
  const colors = ['#222326', '#232427', '#25262a', '#272728', '#2366ee', '#22232680'];
  const groups = clusterColors(colors.map((c) => ({ color: parseColor(c)!, count: 1 })));
  assert.equal(groups.length, 3);
  assert.equal(groups.find((g) => g.members.includes('#222326'))?.members.length, 4);
  assert.deepEqual(
    clusterColors(colors.reverse().map((c) => ({ color: parseColor(c)!, count: 1 }))),
    groups,
  );
});
test('confidence rejects unsupported claims and grows with independent support and observations', () => {
  assert.equal(finding('hero', [signal(1, 'flex')], 30).value, null);
  assert.equal(finding('hero', [signal(0.2, 'top'), signal(0.2, 'size')], 30).confidence, 0);
  const one = finding('x', [signal(1, 'a'), signal(1, 'b')], 1),
    many = finding('x', [signal(1, 'a'), signal(1, 'b')], 4);
  assert(many.confidence > one.confidence);
  assert.equal(many.confidence, 1);
  assert.equal(finding(null, [signal(1, 'a'), signal(1, 'b')]).confidence, 0);
});
test('primary follows repeated blue actions, never first red button; gold emphasis is accent evidence', () => {
  const capture = semanticFixture(),
    dna = buildDNA(capture, capture.finalUrl);
  assert.equal(dna.colors.roles.primary?.value, '#2366ee');
  assert.equal(dna.colors.roles.danger?.value, null);
  assert.equal(dna.colors.roles.success?.confidence, 0);
  assert(dna.colors.roles.accent?.value);
  // Remove blue as accent evidence; gold must still be independently recognized.
  for (const e of capture.desktop.elements)
    if (e.styles.backgroundColor === '#2366ee') e.styles.backgroundColor = '#777777';
  assert.equal(buildDNA(capture, capture.finalUrl).colors.roles.accent?.value, '#cbb46c');
});
test('coverage does not double-count nested backgrounds; large page background outranks tiny repeated colors', () => {
  const capture = semanticFixture();
  for (let i = 0; i < 30; i++)
    capture.desktop.elements.push(
      element(`icon${i}`, 'span', 'e0', i * 10, 1300, 8, 8, { backgroundColor: '#ff0000' }, 0, 1),
    );
  const dna = buildDNA(capture, capture.finalUrl);
  assert.equal(dna.colors.roles.background?.value, '#222326');
  assert(dna.colors.palette.reduce((n, c) => n + c.visualCoverageEstimate, 0) <= 100.5);
  assert(dna.colors.palette.find((c) => c.value === '#222326')!.visualCoverageEstimate > 70);
  assert.equal(dna.colors.roles.border?.value, null);
});
test('spacing infers recurring unit and contexts but refuses a single-value scale', () => {
  const ctx = context(semanticFixture().desktop.elements),
    spacing = analyzeSpacing(ctx);
  assert.equal(spacing.baseUnit.value, 8);
  assert(spacing.contexts.section?.length);
  assert(spacing.contexts.component?.length);
  assert(spacing.tokens.space16);
  const sparse = analyzeSpacing(
    context([
      element('x', 'button', null, 0, 0, 100, 40, { paddingTop: '16px', paddingBottom: '16px' }),
    ]),
  );
  assert.equal(sparse.baseUnit.value, null);
  assert(!('xs' in sparse.tokens));
});
test('hero requires heading and action, split hero requires two horizontal substantial groups', () => {
  const capture = semanticFixture(),
    dna = buildDNA(capture, capture.finalUrl);
  assert.equal(dna.layout.regions.filter((r) => r.type.includes('hero')).length, 1);
  assert(dna.layout.regions.some((r) => r.type === 'split hero'));
  assert(dna.layout.regions.some((r) => r.type === 'cards grid'));
});
test('many flex regions and a heading-less large header do not produce heroes', () => {
  const capture = semanticFixture();
  capture.desktop.elements = capture.desktop.elements.filter(
    (e) => e.tag !== 'h1' && e.tag !== 'h2',
  );
  for (let i = 0; i < 40; i++)
    capture.desktop.elements.push(
      element(`flex${i}`, 'div', 'e0', 0, 100, 1200, 400, { display: 'flex' }, 3),
    );
  const dna = buildDNA(capture, capture.finalUrl);
  assert(!dna.layout.regions.some((r) => r.type.includes('hero')));
  assert(!JSON.stringify(dna.layout).includes('flex layout'));
});
test('component families group equivalent anatomy and expose resolvable tokens without IDs', () => {
  const capture = semanticFixture();
  const dna = buildDNA(capture, capture.finalUrl),
    cards = dna.componentFamilies.filter((c) => c.type === 'card');
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.instances, 3);
  assert.equal(cards[0]?.group.layout, '3-column');
  assert.equal(cards[0]?.structure.hasTitle, true);
  assert.equal(cards[0]?.visualStyle.padding?.token, 'spacing.space16');
  for (const family of dna.componentFamilies)
    for (const ref of Object.values(family.visualStyle))
      if (ref.token) {
        const [category, name] = ref.token.split('.');
        assert.equal(
          (dna.tokens[category as keyof typeof dna.tokens] as Record<string, { value: unknown }>)[
            name!
          ]!.value,
          ref.resolved,
        );
      }
});
test('typography infers hierarchy and personality without naming subjective font styles', () => {
  const dna = buildDNA(semanticFixture(), 'https://fixture.example');
  assert.equal(dna.typography.roles.display?.value?.size, '56px');
  assert.equal(dna.typography.roles.body?.value?.size, '16px');
  assert.equal(dna.typography.roles.label?.value?.size, '16px');
  assert.equal(dna.typography.personality.headingContrast?.value, 'high');
  assert(!JSON.stringify(dna.typography).includes('geometric'));
});

test('div-based titles and descriptions form recurring cards in a flex grid', () => {
  const capture = semanticFixture();
  const es = capture.desktop.elements;
  es.find((e) => e.id === 'e9')!.styles.display = 'flex';
  for (const e of es) {
    if (e.tag === 'h2') {
      e.tag = 'div';
      e.styles.fontSize = '18px';
    } else if (e.tag === 'p') e.tag = 'div';
  }
  const dna = buildDNA(capture, capture.finalUrl);
  assert(
    dna.componentFamilies.some(
      (f) =>
        f.type === 'card' &&
        f.instances === 3 &&
        f.structure.hasTitle &&
        f.structure.hasDescription,
    ),
  );
  assert(dna.layout.regions.some((r) => r.type === 'cards grid'));
  assert.notEqual(dna.colors.roles.surface?.value, '#be0505');
});

test('overlapping visual groups are not interpreted as responsive columns', () => {
  const capture = semanticFixture();
  for (const e of capture.desktop.elements) if (e.tag === 'article') e.rect.x = 120;
  const dna = buildDNA(capture, capture.finalUrl);
  assert(!dna.responsive.layoutChanges.some((f) => f.value?.startsWith('3-column')));
});

test('a single action with the same color on two properties is not repeated evidence', () => {
  const capture = semanticFixture();
  capture.desktop.elements = capture.desktop.elements.filter(
    (e) => e.tag === 'body' || e.id === 'e2',
  );
  const button = capture.desktop.elements.find((e) => e.id === 'e2')!;
  button.styles.color = button.styles.backgroundColor!;
  const dna = buildDNA(capture, capture.finalUrl);
  assert.equal(dna.colors.roles.primary?.value, null);
});

test('equally supported competing action colors leave primary and secondary unknown', () => {
  const capture = semanticFixture();
  capture.desktop.elements = capture.desktop.elements.filter((e) => e.tag === 'body');
  for (let i = 0; i < 4; i++)
    capture.desktop.elements.push(
      element(
        `action${i}`,
        'button',
        'e0',
        i * 200,
        200,
        180,
        40,
        { backgroundColor: i % 2 ? '#ff0000' : '#2366ee' },
        0,
        8,
      ),
    );
  const dna = buildDNA(capture, capture.finalUrl);
  assert.equal(dna.colors.roles.primary?.value, null);
  assert.equal(dna.colors.roles.secondary?.value, null);
});
test('responsive interpretation summarizes columns and heading reduction, never exact breakpoints', () => {
  const dna = buildDNA(semanticFixture(), 'https://fixture.example');
  assert(dna.responsive.layoutChanges.some((f) => f.value === '3-column groups become 1-column'));
  assert.equal(dna.responsive.typography.headingReduction?.value, '56px → 36px');
  assert.deepEqual(dna.responsive.observedViewports, [1440, 390]);
  assert(dna.responsive.limitation.includes('exact breakpoints are unknown'));
});
test('equivalent transition durations group across instances and observed frames remain separate', () => {
  const capture = semanticFixture();
  capture.frames = [0, 1].map((p) => ({
    progress: p,
    elements: [
      {
        id: 'e7',
        y: 360,
        opacity: String(p),
        transform: 'none',
        filter: 'none',
        position: 'static',
      },
    ],
  }));
  const dna = buildDNA(capture, capture.finalUrl);
  assert.equal(
    dna.motion.patterns.find((p) => p.type === 'interactive-color-transition')?.instances,
    4,
  );
  assert.equal(dna.motion.tokens.duration200?.value, '200ms');
  assert(dna.motion.patterns.some((p) => p.type === 'observed-opacity-change'));
});
test('V2 exports refined deterministic semantics while RAW retains capture, candidates and evidence', () => {
  const capture = semanticFixture(),
    { raw, dna } = buildAnalysis(capture, capture.finalUrl);
  assert.equal(dna.schemaVersion, '2.0');
  assert.equal(raw.schemaVersion, 'raw-2.0');
  assert.equal(raw.capture, capture);
  assert(raw.normalized.layout.some((r) => r.elementId));
  assert(raw.normalized.components.length);
  assert(!JSON.stringify(dna).match(/"elementId"|"e\d+"|"rect"|"computedStyle"/));
  assert.equal(dna.identity.theme.value, 'dark');
  assert(dna.designSummary.typography);
  const again = buildDNA(capture, capture.finalUrl);
  again.source.capturedAt = dna.source.capturedAt;
  assert.deepEqual(again, dna);
});
test('empty capture yields unknown semantic roles without fabricated summary', () => {
  const capture = semanticFixture();
  capture.desktop.elements = [];
  capture.mobile.elements = [];
  const dna = buildDNA(capture, capture.finalUrl);
  assert.equal(dna.identity.theme.value, null);
  assert.deepEqual(dna.designSummary, {});
  assert(Object.values(dna.colors.roles).every((f) => f.value === null && f.confidence === 0));
});
test('secondary warnings aggregate status without URLs and iframe navigation is secondary', () => {
  const warnings = new ResourceWarnings();
  warnings.add(400);
  warnings.add(400);
  warnings.add();
  assert(warnings.messages().some((m) => m.includes('2 secondary resource(s): HTTP 400')));
  assert(
    warnings.messages().every((m) => m.includes('Main document analysis completed successfully')),
  );
  assert.equal(isMainDocument(true, false), false);
  assert.equal(isMainDocument(false, true), false);
  assert.equal(isMainDocument(true, true), true);
  assert(mainDocumentError(503).startsWith('MAIN DOCUMENT ERROR:'));
});
test('bounded semantic pipeline processes 1800 elements within a generous regression budget', () => {
  const capture = semanticFixture();
  while (capture.desktop.elements.length < 1800) {
    const i = capture.desktop.elements.length;
    capture.desktop.elements.push(
      element(`extra${i}`, 'span', 'e0', 0, i, 100, 20, { color: '#aaaaaa' }, 0, 10),
    );
  }
  const start = performance.now();
  buildDNA(capture, capture.finalUrl);
  assert(performance.now() - start < 3000);
});
