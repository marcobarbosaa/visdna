import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { buildAnalysis } from '../src/analysis/dna.js';
import { semanticFixture } from './semantic-fixture.js';

test(
  'existing UI renders every V1/V2 tab and versioned downloads without executing evidence',
  { timeout: 30000 },
  async () => {
    const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
    try {
      const { raw, dna } = buildAnalysis(semanticFixture(), 'https://fixture.example/');
      dna.colors.roles.primary!.evidence.push('<img src=x onerror=alert(1)>');
      const records = [
        { id: 'v2', domain: 'v2.fixture.example', dna },
        { id: 'v1', domain: 'v1.fixture.example', dna: raw.normalized },
      ].map((r) => ({
        ...r,
        url: 'https://fixture.example/',
        createdAt: '2026-10-06T12:00:00Z',
        stage: 'complete',
        artifacts: {
          desktop: true,
          mobile: false,
          fullPage: false,
          raw: r.id === 'v2',
          segments:
            r.id === 'v2'
              ? [{ index: 0, file: 'main.png', startY: 0, endY: 900, width: 1440 }]
              : [],
        },
      }));
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/*', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/analyses')
          return route.fulfill({ json: records.map(({ dna, ...r }) => ({ ...r, hasDNA: !!dna })) });
        const match = path.match(/^\/api\/analyses\/(v1|v2)(?:\/(dna|raw))?$/);
        if (match) {
          const record = records.find((r) => r.id === match[1])!;
          return route.fulfill({
            json: match[2] === 'raw' ? raw : match[2] === 'dna' ? record.dna : record,
          });
        }
        if (path.endsWith('.png')) return route.fulfill({ status: 204 });
        const files: Record<string, [string, string]> = {
          '/': ['index.html', 'text/html'],
          '/app.js': ['app.js', 'text/javascript'],
          '/semantic.js': ['semantic.js', 'text/javascript'],
          '/i18n.js': ['i18n.js', 'text/javascript'],
          '/style.css': ['style.css', 'text/css'],
        };
        const file = files[path];
        if (!file) return route.fulfill({ status: 404 });
        return route.fulfill({
          body: await readFile(new URL(`../web/${file[0]}`, import.meta.url)),
          contentType: file[1],
        });
      });
      await page.goto('https://ui.fixture.example/');
      for (const version of ['v2', 'v1']) {
        await page
          .locator('#history button')
          .filter({ hasText: `${version}.fixture.example` })
          .click();
        await page.locator('#result').waitFor({ state: 'visible' });
        assert(
          (await page.locator('#meta').textContent())?.includes(
            version === 'v2' ? 'versão 2.0' : 'versão 1.0',
          ),
        );
        assert.equal(
          await page.locator('#download').getAttribute('href'),
          `/api/analyses/${version}/dna`,
        );
        if (version === 'v2')
          assert.equal(
            await page.getByText('Baixar análise bruta').getAttribute('href'),
            '/api/analyses/v2/raw',
          );
        for (const tab of [
          'Cores',
          'Tipografia',
          'Espaçamento',
          'Bordas',
          'Sombras',
          'Componentes',
          'Layout',
          'Movimento',
          'DNA Visual bruto',
          'Visão geral',
        ]) {
          await page
            .locator('#tabs button')
            .filter({ hasText: new RegExp(`^${tab}$`) })
            .click();
          assert(
            (await page.locator('#panel').textContent())!.trim().length > 0,
            `${version}: ${tab}`,
          );
        }
        assert.equal(await page.locator('#error').isVisible(), false);
        assert.equal(await page.locator('a[href$="full.png"], a[href$="mobile.png"]').count(), 0);
        if (version === 'v2') {
          await page.getByRole('button', { name: 'Página inteira', exact: true }).click();
          assert.equal(await page.locator('.segments img').count(), 1);
        } else
          assert.equal(
            await page.getByRole('button', { name: 'Página inteira', exact: true }).count(),
            0,
          );
      }
      assert.deepEqual(errors, []);
      assert.equal(await page.locator('[onerror]').count(), 0);
    } finally {
      await browser.close();
    }
  },
);
