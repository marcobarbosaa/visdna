import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capture } from '../src/browser/engine.js';
import { buildRawDNA as buildDNA } from '../src/analysis/raw.js';
import { buildAnalysis } from '../src/analysis/dna.js';
import { safeFetch } from '../src/security/fetch.js';
test(
  'sandboxed Chromium: fixture, computed styles, scroll, mobile and screenshots',
  { timeout: 70000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'visdna-e2e-'));
    const html = await readFile(new URL('./fixture.html', import.meta.url));
    const stages: string[] = [];
    try {
      const result = await capture(
        'https://fixture.example/',
        dir,
        (s) => stages.push(s),
        async (url) => {
          assert.equal(new URL(url).hostname, 'fixture.example');
          return { status: 200, headers: { 'content-type': 'text/html' }, body: html };
        },
      );
      const dna = buildDNA(result, 'https://fixture.example/');
      const v2 = buildAnalysis(result, 'https://fixture.example/');
      assert.equal(v2.dna.schemaVersion, '2.0');
      assert.equal(v2.raw.capture.frames.length, 5);
      assert(v2.dna.componentFamilies.some((f) => f.type === 'card' && f.instances === 3));
      assert.equal(v2.dna.layout.regions.filter((r) => r.type.includes('hero')).length, 1);
      assert(v2.dna.responsive.layoutChanges.some((f) => f.value?.includes('3-column')));
      assert(v2.dna.motion.patterns.some((p) => p.type === 'observed-opacity-change'));
      assert(result.desktop.elements.some((e) => e.styles.fontSize === '64px'));
      assert(result.mobile.elements.some((e) => e.styles.fontSize === '36px'));
      assert(dna.colors.palette.some((t) => t.value === '#176c53'));
      assert(dna.components.some((c) => c.type === 'card'));
      assert(dna.motion.some((m) => m.patterns.includes('fade / reveal candidate')));
      assert.equal(result.frames.length, 5);
      assert((await readFile(join(dir, 'main.png'))).length > 1000);
      assert((await readFile(join(dir, 'full.png'))).length > 1000);
      assert.deepEqual(stages, ['opening', 'extracting', 'scroll', 'responsive']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  'secondary HTTP errors including iframe navigation preserve successful main analysis',
  { timeout: 70000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'visdna-warnings-'));
    try {
      const html = (await readFile(new URL('./fixture.html', import.meta.url), 'utf8')).replace(
        '</body>',
        '<img src="/bad.png?secret=hidden" /><iframe src="/bad-frame?secret=hidden"></iframe></body>',
      );
      const result = await capture(
        'https://fixture.example/',
        dir,
        () => {},
        async (url) =>
          new URL(url).pathname === '/'
            ? { status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from(html) }
            : {
                status: 400,
                headers: { 'content-type': 'text/plain' },
                body: Buffer.from('failed'),
              },
      );
      assert(result.desktop.elements.length > 3);
      assert(result.warnings.some((w) => w.includes('2 secondary resource(s): HTTP 400')));
      assert(
        result.warnings.every((w) => !w.includes('secret') && !w.includes('MAIN DOCUMENT ERROR')),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test('main document HTTP error fails explicitly', { timeout: 70000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'visdna-main-error-'));
  try {
    await assert.rejects(
      capture(
        'https://fixture.example/',
        dir,
        () => {},
        async () => ({
          status: 400,
          headers: { 'content-type': 'text/html' },
          body: Buffer.from('failed'),
        }),
      ),
      /MAIN DOCUMENT ERROR:.*HTTP 400/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test(
  'sandboxed Chromium: private redirect blocked by production fetch',
  { timeout: 70000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'visdna-redirect-'));
    try {
      let attempted = false;
      await assert.rejects(
        capture(
          'https://fixture.example/',
          dir,
          () => {},
          async (url, budget, signal) => {
            attempted = true;
            return url === 'https://fixture.example/'
              ? { status: 302, headers: { location: 'http://127.0.0.1/' }, body: Buffer.alloc(0) }
              : safeFetch(url, budget, signal);
          },
        ),
      );
      assert(attempted, 'Browser must launch before this test can verify redirects');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
