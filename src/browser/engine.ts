import { chromium, type Route } from 'playwright';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { collect, frame } from './collect.js';
import { safeFetch, type Resource, type Budget } from '../security/fetch.js';
import { SafeError } from '../security/url.js';
import type { Capture, Stage } from '../types.js';
import { ResourceWarnings, mainDocumentError, isMainDocument } from './warnings.js';
export type Fetcher = (url: string, budget: Budget, signal: AbortSignal) => Promise<Resource>;
export async function capture(
  url: string,
  dir: string,
  stage: (stage: Stage) => void,
  fetcher: Fetcher = safeFetch,
): Promise<Capture> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 60000);
  // Fail-closed proxy: un-routed browser traffic cannot reach the target network.
  const deny = createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    deny.once('error', reject);
    deny.listen(0, '127.0.0.1', resolve);
  });
  const address = deny.address();
  if (!address || typeof address === 'string') throw new Error('Proxy initialization failed');
  const warnings = new Set<string>();
  const resourceWarnings = new ResourceWarnings();
  const budget: Budget = { requests: 0, bytes: 0 };
  let redirects = 0;
  let mainError = '';
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    stage('opening');
    browser = await chromium.launch({
      headless: true,
      chromiumSandbox: true,
      proxy: { server: `http://127.0.0.1:${address.port}`, bypass: '<-loopback>' },
      args: [
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--js-flags=--max-old-space-size=256',
      ],
    });
    const activeBrowser = browser;
    abort.signal.addEventListener(
      'abort',
      () => {
        void activeBrowser.close();
      },
      { once: true },
    );
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block',
      acceptDownloads: false,
      permissions: [],
      ignoreHTTPSErrors: false,
    });
    context.setDefaultTimeout(10000);
    context.setDefaultNavigationTimeout(25000);
    await context.routeWebSocket('**/*', (ws) => ws.close());
    const page = await context.newPage();
    await context.route('**/*', async (route: Route) => {
      const request = route.request();
      const main = isMainDocument(
        request.isNavigationRequest(),
        request.frame() === page.mainFrame(),
      );
      try {
        if (request.method() !== 'GET' || ['media', 'other'].includes(request.resourceType())) {
          await route.abort();
          return;
        }
        const response = await fetcher(request.url(), budget, abort.signal);
        if (response.status >= 300 && response.status < 400 && ++redirects > 12)
          throw new SafeError('Limite de redirecionamentos atingido.');
        if (response.status >= 400) {
          if (main) throw new SafeError(mainDocumentError(response.status));
          resourceWarnings.add(response.status);
        }
        await route.fulfill(response);
      } catch (error) {
        const message =
          error instanceof SafeError
            ? error.message
            : 'Recurso indisponível, SSL inválido ou acesso bloqueado.';
        if (main)
          mainError = message.startsWith('MAIN DOCUMENT ERROR:')
            ? message
            : `MAIN DOCUMENT ERROR: ${message}`;
        else resourceWarnings.add();
        await route.abort().catch(() => {});
      }
    });
    context.on('page', (popup) => {
      if (popup !== page) void popup.close();
    });
    page.on('dialog', (dialog) => void dialog.dismiss());
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    } catch {
      throw new SafeError(
        mainError || 'Não foi possível abrir a página: timeout, bloqueio ou falha de rede.',
      );
    }
    await page.waitForTimeout(700);
    await page.evaluate(() =>
      Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 1200))]),
    );
    const blocked = await page.evaluate(() =>
      /just a moment|verify you are human|checking your browser|access denied|captcha/i.test(
        document.title + ' ' + document.body?.innerText.slice(0, 500),
      ),
    );
    if (blocked)
      throw new SafeError(
        'A página apresenta um bloqueio de acesso ou verificação. O VisDNA não tenta contorná-lo.',
      );
    stage('extracting');
    const desktop = await collect(page);
    if (desktop.elements.length < 3) throw new SafeError('Página sem conteúdo visual suficiente.');
    await page.screenshot({ path: join(dir, 'main.png') });
    if (
      desktop.pageHeight <= 12000 &&
      (await page.evaluate(() => document.documentElement.scrollWidth)) <= 2400
    )
      await page.screenshot({ path: join(dir, 'full.png'), fullPage: true });
    else
      warnings.add(
        'Screenshot integral omitido: página excede 12.000 px de altura ou 2.400 px de largura.',
      );
    stage('scroll');
    const frames = [];
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      await page.evaluate(
        (p) =>
          scrollTo(0, Math.min(12000, document.documentElement.scrollHeight - innerHeight) * p),
        progress,
      );
      await page.waitForTimeout(220);
      frames.push(await frame(page, progress));
    }
    stage('responsive');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(350);
    const mobile = await collect(page);
    await page.screenshot({ path: join(dir, 'mobile.png') });
    return {
      desktop,
      mobile,
      frames,
      warnings: [...warnings, ...resourceWarnings.messages()],
      finalUrl: page.url(),
    };
  } finally {
    clearTimeout(timer);
    abort.abort();
    await browser?.close().catch(() => {});
    deny.close();
  }
}
