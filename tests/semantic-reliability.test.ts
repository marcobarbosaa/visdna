import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDNA } from '../src/analysis/dna.js';
import { context } from '../src/analysis/semantic/context.js';
import { radiusIdentity, summarize } from '../src/analysis/semantic/identity.js';
import { componentForeground } from '../src/analysis/semantic/components.js';
import { element, semanticFixture } from './semantic-fixture.js';

test('global radius uses pill/circle geometry and preserves raw extreme radii', () => {
  const capture = semanticFixture();
  capture.desktop.elements = Array.from({ length: 51 }, (_, i) =>
    element(`r${i}`, 'button', null, 0, i * 50, i < 22 ? 160 : 40, 40, {
      borderRadius: i < 22 ? '1080px' : i < 39 ? '100%' : i < 48 ? '6px' : '5px',
    }),
  );
  const before = JSON.stringify(capture);
  const dna = buildDNA(capture, capture.finalUrl);
  const radius = dna.identity.characteristics.find((f) => f.value === 'pill-heavy');
  assert(radius);
  assert(radius.evidence.some((e) => e.includes('22 pill-like') && e.includes('17 circular')));
  assert(radius.evidence.some((e) => e.includes('5-6px')));
  assert(!radius.evidence.some((e) => e.includes('1080')));
  assert.equal(JSON.stringify(capture), before);
  assert(Object.values(dna.tokens.radius).some((t) => t.value === 'pill'));
  assert(Object.values(dna.tokens.radius).some((t) => t.value === 'circle'));
});

test('radius distinguishes ordinary geometry and remains unknown with sparse evidence', () => {
  for (const [radius, width, height, expected] of [
    ['0px', 200, 100, 'sharp'],
    ['6px', 200, 100, 'low-radius'],
    ['16px', 200, 100, 'moderately-rounded'],
    ['24px', 200, 80, 'rounded'],
    ['1296px', 40, 40, 'circle-heavy'],
  ] as const) {
    const ctx = context(
      Array.from({ length: 4 }, (_, i) =>
        element(`${i}`, 'button', null, 0, i * 100, width, height, { borderRadius: radius }),
      ),
    );
    assert.equal(radiusIdentity(ctx).value, expected);
  }
  const sparse = radiusIdentity(
    context([element('r', 'div', null, 0, 0, 20, 20, { borderRadius: '1080px' })]),
  );
  assert.equal(sparse.value, null);
  assert.equal(sparse.confidence, 0);
});

function cardText(wrapper = '#faae33') {
  const card = element(
    'card',
    'div',
    null,
    0,
    0,
    300,
    240,
    { backgroundColor: '#faae33', color: wrapper },
    2,
    120,
  );
  const children = [
    element('title', 'h3', 'card', 10, 10, 280, 30, { color: '#402011' }, 0, 20),
    element('body', 'p', 'card', 10, 50, 280, 100, { color: '#402011' }, 0, 100),
  ];
  return { card, children };
}

test('component foreground follows visible heading and description, including nonmatching wrappers', () => {
  for (const wrapper of ['#faae33', '#ff0000']) {
    const { card, children } = cardText(wrapper);
    const ctx = context([card, ...children]);
    assert.equal(componentForeground(card, ctx.descendants(card), ctx), '#402011');
    const capture = semanticFixture();
    capture.desktop.elements = [
      card,
      ...children,
      ...[card, ...children].map((e) => ({
        ...e,
        id: `${e.id}2`,
        parent: e.parent ? `${e.parent}2` : null,
      })),
    ];
    const family = buildDNA(capture, capture.finalUrl).componentFamilies.find(
      (f) => f.type === 'card',
    );
    assert.equal(family?.instances, 2);
    assert.equal(family?.visualStyle.background?.resolved, '#faae33');
    assert.equal(family?.visualStyle.color?.resolved, '#402011');
  }
});

test('foreground excludes invisible text and nested badge surfaces; contrast is contextual', () => {
  const { card, children } = cardText();
  children.push(
    element(
      'badge',
      'span',
      'card',
      0,
      0,
      100,
      30,
      { backgroundColor: '#402011', color: '#faae33' },
      0,
      5000,
    ),
    element(
      'hidden',
      'span',
      'card',
      0,
      0,
      100,
      30,
      { color: '#ff0000', visibility: 'hidden' },
      0,
      5000,
    ),
    element('transparent', 'span', 'card', 0, 0, 100, 30, { color: 'rgba(255,0,0,0)' }, 0, 5000),
    element('faded', 'span', 'card', 0, 0, 100, 30, { color: '#ff0000', opacity: '0.0' }, 0, 5000),
  );
  let ctx = context([card, ...children]);
  assert.equal(componentForeground(card, ctx.descendants(card), ctx), '#402011');
  // A same-surface near-yellow leaf cannot outrank a real, legible heading.
  children[1]!.styles.color = '#faaf34';
  children[1]!.textLength = 10000;
  ctx = context([card, ...children]);
  assert.equal(componentForeground(card, ctx.descendants(card), ctx), '#402011');
  // Do not invent a contrasting color when the only observed text is low contrast.
  ctx = context([card, children[1]!]);
  assert.equal(componentForeground(card, ctx.descendants(card), ctx), '#faaf34');
});

test('interactive labels supply foreground and wrappers without observed text do not', () => {
  const { card } = cardText();
  const link = element('link', 'a', 'card', 0, 0, 160, 40, {}, 1, 15);
  const label = element('label', 'span', 'link', 0, 0, 160, 40, { color: '#402011' }, 0, 15);
  const ctx = context([card, link, label]);
  assert.equal(componentForeground(card, ctx.descendants(card), ctx), '#402011');
  assert.equal(componentForeground(card, [], context([card])), '');
});

function roleFixture(highlights: boolean, secondary = false) {
  const capture = semanticFixture();
  capture.desktop.elements = [
    element('root', 'body', null, 0, 0, 1400, 1800, { backgroundColor: '#ffffff' }, 4),
  ];
  for (let i = 0; i < 4; i++) {
    const id = `s${i}`;
    capture.desktop.elements.push(
      element(id, 'section', 'root', 0, i * 400, 1400, 400, {}, 3),
      element(
        `${id}b`,
        i % 2 ? 'a' : 'button',
        id,
        0,
        i * 400,
        160,
        40,
        { backgroundColor: '#2366ee', color: secondary && i < 2 ? '#be0505' : '#ffffff' },
        1,
        10,
      ),
      element(
        `${id}badge`,
        'span',
        `${id}b`,
        0,
        i * 400,
        60,
        20,
        {
          color: secondary && i < 2 ? '#be0505' : '#2366ee',
          backgroundColor: '#2366ee',
          fontWeight: '700',
          borderRadius: '100px',
        },
        0,
        10,
      ),
    );
    if (highlights)
      capture.desktop.elements.push(
        element(
          `${id}h`,
          'h2',
          id,
          0,
          i * 400 + 80,
          200,
          40,
          { color: '#2366ee', fontWeight: '700' },
          0,
          20,
        ),
      );
  }
  return buildDNA(capture, capture.finalUrl).colors.roles;
}

test('action labels and nested badges cannot fabricate independent accent evidence', () => {
  const roles = roleFixture(false);
  assert.equal(roles.primary?.value, '#2366ee');
  for (const role of ['accent', 'secondary']) {
    assert.equal(roles[role]?.value, null);
    assert.equal(roles[role]?.confidence, 0);
  }
});

test('shared primary/accent is allowed only with explicit independent highlight evidence', () => {
  const roles = roleFixture(true);
  assert.equal(roles.primary?.value, '#2366ee');
  assert.equal(roles.accent?.value, '#2366ee');
  for (const role of ['primary', 'accent'])
    assert(
      roles[role]?.evidence.some(
        (e) => e.includes('Shared color') && e.includes('disjoint element contexts'),
      ),
    );
});

test('secondary derived from the same primary actions is unknown', () => {
  const roles = roleFixture(false, true);
  assert.equal(roles.primary?.value, '#2366ee');
  assert.equal(roles.secondary?.value, null);
  assert.equal(roles.secondary?.confidence, 0);
  assert(roles.secondary?.evidence.some((e) => e.includes('shares dominant action')));
});

test('persistent summary requires confidence and multiple observed checkpoints and regions', () => {
  const capture = semanticFixture();
  const dna = buildDNA(capture, capture.finalUrl);
  for (const [confidence, checkpoints, regions, expected] of [
    [0.7, 3, 2, true],
    [0.69, 20, 8, false],
    [1, 2, 2, false],
    [1, 20, 1, false],
  ] as const) {
    dna.motion.patterns = [
      {
        type: 'persistent-scroll-visual',
        instances: 1,
        duration: null,
        easing: null,
        confidence,
        evidence: [
          `Graphic remained in viewport across ${checkpoints} checkpoints and ${regions} regions`,
        ],
      },
    ];
    const summary = summarize(dna);
    assert.equal(!!summary.persistentScroll, expected);
    if (expected) {
      assert(summary.persistentScroll!.includes('causality is not established'));
      assert(!/3D|WebGL|parallax/.test(summary.persistentScroll!));
    }
  }
  dna.motion.patterns = [];
  assert.equal(summarize(dna).persistentScroll, undefined);
  dna.motion.patterns = [
    {
      type: 'persistent-scroll-visual',
      instances: 1,
      confidence: 1,
      duration: null,
      easing: null,
      evidence: [],
    },
  ];
  assert.equal(summarize(dna).persistentScroll, undefined);
});
