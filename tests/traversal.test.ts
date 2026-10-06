import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextCheckpoint,
  intervalCoverage,
  mergeSnapshot,
  coverage,
} from '../src/browser/traversal.js';
import { semanticFixture, element } from './semantic-fixture.js';
import { buildDNA } from '../src/analysis/dna.js';
import type { VisualState } from '../src/types.js';

test('adaptive distances reach a 15k bottom; tall-page gaps are measured, never counted as observed', () => {
  for (const height of [900, 3000, 8000, 15293, 1000000]) {
    const points = [0];
    while (points.at(-1)! < height - 900 && points.length < 20)
      points.push(nextCheckpoint(points.at(-1)!, height, 900, 20 - points.length));
    assert.equal(points.at(-1), Math.max(0, height - 900));
    assert(points.length <= 20);
    const ratio = intervalCoverage(
      points.map((y) => [y, y + 900]),
      height,
    );
    assert(height > 18000 ? ratio < 0.1 : ratio === 1);
  }
  assert.equal(
    intervalCoverage(
      [
        [0, 900],
        [800, 1800],
      ],
      1800,
    ),
    1,
  );
  const snapshot = semanticFixture().desktop;
  assert.equal(coverage([], snapshot, 'deadline').coverage, 0);
});
test('merge preserves initial styles and stable identity while adding lazy nodes and enforcing global cap', () => {
  const base = semanticFixture().desktop;
  const update = structuredClone(base);
  update.elements[0]!.styles.color = '#123456';
  update.elements.push(element('new', 'canvas', 'e0', 0, 1600, 100, 100));
  const merged = mergeSnapshot(base, update);
  assert.equal(merged.elements.length, base.elements.length + 1);
  assert.equal(merged.elements[0]!.styles.color, base.elements[0]!.styles.color);
  assert.equal(new Set(merged.elements.map((e) => e.id)).size, merged.elements.length);
  update.elements = Array.from({ length: 1800 }, (_, i) =>
    element(`new${i}`, 'div', null, 0, 0, 10, 10),
  );
  assert.equal(mergeSnapshot(base, update).elements.length, 1800);
  assert.equal(mergeSnapshot(base, update).truncated, true);
});
test('static canvas, time-only changes and unstable scroll controls do not receive scroll association', () => {
  for (const mode of ['static', 'time', 'scroll', 'unstable']) {
    const capture = semanticFixture();
    capture.visualStates = [];
    for (let i = 0; i < 4; i++)
      for (const phase of ['arrival', 'settled'] as const) {
        const state: VisualState = {
          id: 'canvas',
          type: 'canvas',
          checkpoint: i,
          phase,
          scrollY: i * 900 + (mode === 'unstable' && phase === 'settled' ? 10 : 0),
          rect: { x: 0, y: 0, width: 100, height: 100 },
          position: 'fixed',
          opacity: '1',
          zIndex: '1',
          transform: 'none',
          visualStateObserved: true,
          sectionIds: [],
          signature: [
            mode === 'static' ? 0 : i * 50 + (mode === 'time' && phase === 'settled' ? 25 : 0),
          ],
        };
        capture.visualStates.push(state);
      }
    const patterns = buildDNA(capture, capture.finalUrl).motion.patterns;
    assert.equal(
      patterns.some((p) => p.type === 'canvas-visual-change'),
      mode !== 'static',
    );
    assert.equal(
      patterns.some((p) => p.type === 'scroll-reactive-region'),
      mode === 'scroll',
    );
  }
});
test('full-width shells do not become content containers and implausible responsive text stays unknown', () => {
  const capture = semanticFixture();
  for (const e of capture.desktop.elements) {
    e.rect.x = 0;
    e.rect.width = 1440;
    e.styles.maxWidth = '1440px';
  }
  for (const e of capture.mobile.elements) if (e.tag === 'p') e.styles.fontSize = '3.9px';
  const dna = buildDNA(capture, capture.finalUrl);
  assert.equal(dna.layout.contentContainerWidth?.value, null);
  assert.equal(dna.layout.viewportWidth, 1440);
  assert.equal(dna.responsive.typography.bodyReduction?.confidence, 0);
});
test('large radii normalize semantically while component foreground/background/border resolve independently', () => {
  const capture = semanticFixture();
  for (const e of capture.desktop.elements)
    if (e.tag === 'button') {
      e.styles.borderRadius = '1296px';
      e.styles.borderWidth = '1px';
      e.styles.borderColor = '#00ff00';
    }
  const dna = buildDNA(capture, capture.finalUrl);
  assert.equal(dna.tokens.radius.radiusPill?.value, 'pill');
  for (const family of dna.componentFamilies.filter((f) => f.type === 'button')) {
    assert.notEqual(family.visualStyle.color?.resolved, family.visualStyle.background?.resolved);
    assert.equal(family.visualStyle.border?.resolved, '#00ff00');
    assert.equal(family.visualStyle.radius?.resolved, 'pill');
  }
  assert(capture.desktop.elements.some((e) => e.styles.borderRadius === '1296px'));
});

test('spacing requires a recurring scale and circle radius follows geometry', () => {
  const capture = semanticFixture();
  capture.desktop.elements = [0, 1].map((i) =>
    element(`x${i}`, 'button', null, 0, 0, 80, 80, { borderRadius: '50%', paddingTop: '116px' }),
  );
  const dna = buildDNA(capture, capture.finalUrl);
  assert.deepEqual(dna.spacing.tokens, {});
  assert.deepEqual(dna.spacing.observed, [116]);
  assert.equal(dna.tokens.radius.radiusCircle?.value, 'circle');
});

test('component foreground uses visible descendant text when wrapper color equals its background', () => {
  const capture = semanticFixture();
  for (const e of capture.desktop.elements)
    if (e.tag === 'article') e.styles.color = e.styles.backgroundColor!;
  const dna = buildDNA(capture, capture.finalUrl);
  const cards = dna.componentFamilies.filter((f) => f.type === 'card');
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.visualStyle.color?.resolved, '#eeeeee');
  assert.notEqual(
    cards[0]?.visualStyle.color?.resolved,
    cards[0]?.visualStyle.background?.resolved,
  );
});

test('secondary actions cannot independently justify the same accent role', () => {
  const capture = semanticFixture();
  capture.desktop.elements = capture.desktop.elements.filter((e) => e.tag === 'body');
  for (let i = 0; i < 10; i++) {
    capture.desktop.elements.push(
      element(`section${i}`, 'section', 'e0', 0, i * 100, 1440, 100, {}, 1),
    );
    capture.desktop.elements.push(
      element(
        `button${i}`,
        'button',
        `section${i}`,
        0,
        i * 100,
        160,
        40,
        { backgroundColor: i < 7 ? '#2366ee' : '#ff0000' },
        0,
        5,
      ),
    );
  }
  const dna = buildDNA(capture, capture.finalUrl);
  assert.equal(dna.colors.roles.secondary?.value, '#ff0000');
  assert.equal(dna.colors.roles.accent?.value, null);
});
