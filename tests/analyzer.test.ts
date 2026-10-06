import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeColor, spacing, tokens } from '../src/analysis/normalize.js';
import { buildRawDNA as buildDNA } from '../src/analysis/raw.js';
import type { Capture, ElementSample } from '../src/types.js';
test('colors normalize with alpha, reject unsupported rather than fabricate', () => {
  assert.equal(normalizeColor('rgb(124, 92, 252)'), '#7c5cfc');
  assert.equal(normalizeColor('#fff'), '#ffffff');
  assert.equal(normalizeColor('rgba(1, 2, 3, 0.5)'), '#01020380');
  assert.equal(normalizeColor('rgba(0, 0, 0, 0)'), null);
  assert.equal(normalizeColor('rgb(300, 0, 0)'), null);
  assert.equal(normalizeColor('oklch(0.8 0.2 20)'), null);
});
test('spacing groups near values and excludes non-pixel and zero', () => {
  assert.deepEqual(
    spacing(['8px', '8.3px', '16px', '0px', 'auto', '20%']).map((t) => [t.value, t.count]),
    [
      ['8px', 2],
      ['16px', 1],
    ],
  );
});
test('frequencies use the whole sample before top-k truncation', () => {
  assert.equal(tokens(['a', 'a', 'b', 'c'], 1)[0]?.frequency, 50);
});
function sample(id: string, tag: string, styles: Record<string, string>): ElementSample {
  return {
    id,
    parent: null,
    tag,
    role: '',
    children: 0,
    textLength: 10,
    rect: { x: 0, y: 0, width: 300, height: 80 },
    styles,
  };
}
export function fixtureCapture(): Capture {
  const elements = [
    sample('e0', 'body', { backgroundColor: 'rgb(245, 246, 242)', color: 'rgb(28, 41, 39)' }),
    sample('e1', 'h1', {
      fontSize: '64px',
      fontWeight: '700',
      fontFamily: 'Arial',
      color: 'rgb(28, 41, 39)',
      lineHeight: '70px',
      letterSpacing: '-2px',
    }),
    sample('e2', 'button', {
      backgroundColor: 'rgb(23, 108, 83)',
      paddingTop: '16px',
      borderRadius: '8px',
    }),
  ];
  return {
    desktop: { width: 1440, height: 900, pageHeight: 900, elements, truncated: false },
    mobile: {
      width: 390,
      height: 844,
      pageHeight: 900,
      elements: elements.map((e) => ({ ...e, styles: { ...e.styles, fontSize: '36px' } })),
      truncated: false,
    },
    frames: [],
    warnings: [],
    finalUrl: 'https://example.com',
  };
}
test('versioned DNA preserves evidence and unknown semantic roles', () => {
  const dna = buildDNA(fixtureCapture(), 'https://example.com');
  assert.equal(dna.schemaVersion, '1.0');
  assert.equal(dna.colors.roles.primary?.value, '#176c53');
  assert.equal(dna.colors.roles.danger?.value, null);
  assert.equal(dna.typography.scale[0]?.role, 'Display');
  assert.equal(dna.components[0]?.type, 'button');
  assert(dna.responsive.changes.length > 0);
  assert(!JSON.stringify(dna).includes('undefined'));
});
