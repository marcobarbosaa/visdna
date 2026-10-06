import { chromium, type Route } from 'playwright';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { writeFile, rm } from 'node:fs/promises';
import { collect, frame } from './collect.js';
import { safeFetch, type Resource, type Budget } from '../security/fetch.js';
import { SafeError } from '../security/url.js';
import type {
  Capture,
  Stage,
  ScreenshotManifest,
  VisualState,
  Snapshot,
  MotionFrame,
  TraversalCoverage,
} from '../types.js';
import {
  CAPTURE_LIMITS,
  nextCheckpoint,
  mergeSnapshot,
  coverage,
  intervalCoverage,
  settle,
} from './traversal.js';
import { visualStates } from './visual.js';
import { ResourceWarnings, mainDocumentError, isMainDocument } from './warnings.js';
export type Fetcher = (url: string, budget: Budget, signal: AbortSignal) => Promise<Resource>;
export async function capture(
  url: string,
  dir: string,
  stage: (stage: Stage) => void,
  fetcher: Fetcher = safeFetch,
): Promise<Capture> {
  const abort = new AbortController();
  const started = Date.now();
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
    let desktop = await collect(page);
    if (desktop.elements.length < 3) throw new SafeError('Página sem conteúdo visual suficiente.');
    const initialElements = desktop.elements.length;
    const screenshots: ScreenshotManifest = {
      desktop: false,
      mobile: false,
      fullPage: false,
      segments: [],
    };
    let screenshotBytes = 0;
    const saveImage = async (name: string, fullPage = false) => {
      try {
        const buffer = await page.screenshot({
          type: name.endsWith('.jpg') ? 'jpeg' : 'png',
          ...(name.endsWith('.jpg') ? { quality: 75 } : {}),
          fullPage,
          timeout: 2000,
        });
        if (screenshotBytes + buffer.length > CAPTURE_LIMITS.screenshotBytes) {
          warnings.add('Limitação: orçamento de armazenamento das capturas atingido.');
          return false;
        }
        await writeFile(join(dir, name), buffer, { mode: 0o600 });
        screenshotBytes += buffer.length;
        return true;
      } catch {
        await rm(join(dir, name), { force: true }).catch(() => {});
        warnings.add('Limitação: uma captura visual não pôde ser concluída.');
        return false;
      }
    };
    screenshots.desktop = await saveImage('main.png');
    const decodeContext = await browser.newContext({
      offline: true,
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    await decodeContext.route('**/*', (route) => route.abort());
    await decodeContext.routeWebSocket('**/*', (ws) => ws.close());
    const decoder = await decodeContext.newPage();
    const visual: VisualState[] = [];
    let visualLimited = false;
    const traverse = async (initial: Snapshot, mobileMode: boolean) => {
      let snapshot = initial;
      const frames: MotionFrame[] = [],
        positions: number[] = [];
      const max = mobileMode ? CAPTURE_LIMITS.mobileCheckpoints : CAPTURE_LIMITS.desktopCheckpoints;
      const deadline = Math.min(
        started + (mobileMode ? 55000 : 45000),
        Date.now() + (mobileMode ? CAPTURE_LIMITS.mobileMs : CAPTURE_LIMITS.desktopMs),
      );
      let stopReason: TraversalCoverage['stopReason'] = 'checkpoints';
      for (let i = 0; i < max; i++) {
        if (Date.now() >= deadline || abort.signal.aborted) {
          stopReason = 'deadline';
          break;
        }
        if (i > 0) {
          const target = nextCheckpoint(
            positions.at(-1)!,
            snapshot.pageHeight,
            snapshot.height,
            max - i,
          );
          await page.evaluate((y) => scrollTo({ top: y, left: 0, behavior: 'instant' }), target);
        }
        await settle(page);
        snapshot = mergeSnapshot(snapshot, await collect(page));
        const state = await frame(page, 0),
          y = state.scrollY || 0;
        state.progress =
          snapshot.pageHeight > snapshot.height ? y / (snapshot.pageHeight - snapshot.height) : 1;
        frames.push(state);
        positions.push(y);
        if (!mobileMode) {
          // A/A2 at the same scroll offset provide a temporal control for the next B observation.
          if (visual.length < CAPTURE_LIMITS.visualSamples && Date.now() + 1200 < deadline) {
            visual.push(...(await visualStates(page, decoder, i, 'arrival', deadline)));
            await settle(page);
            visual.push(...(await visualStates(page, decoder, i, 'settled', deadline)));
          } else visualLimited = true;
          const file = `segment-${String(i).padStart(3, '0')}.jpg`;
          // Reuse the top image; otherwise retain one viewport image per position.
          const saved =
            i === 0 && screenshots.desktop ? 'main.png' : (await saveImage(file)) ? file : null;
          if (saved)
            screenshots.segments.push({
              index: i,
              file: saved,
              startY: y,
              endY: Math.min(snapshot.pageHeight, y + snapshot.height),
              width: snapshot.width,
            });
        }
        // Re-check height after settling, including content appended at the former bottom.
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        snapshot.pageHeight = height;
        if (y + snapshot.height >= height - 1) {
          stopReason = 'bottom';
          break;
        }
      }
      return { snapshot, frames, coverage: coverage(positions, snapshot, stopReason) };
    };
    stage('scroll');
    const traversed = await traverse(desktop, false);
    desktop = traversed.snapshot;
    if (
      desktop.pageHeight <= 12000 &&
      (desktop.pageWidth || desktop.width) <= 2400 &&
      Date.now() < started + 47000
    ) {
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await settle(page);
      const dimensions = await page.evaluate(() => ({
        height: document.documentElement.scrollHeight,
        width: document.documentElement.scrollWidth,
      }));
      if (dimensions.height <= 12000 && dimensions.width <= 2400)
        screenshots.fullPage = await saveImage('full.png', true);
      if (screenshots.fullPage) {
        for (const segment of screenshots.segments)
          if (segment.file !== 'main.png') await rm(join(dir, segment.file), { force: true });
        screenshots.segments = [];
      }
    }
    stage('responsive');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await settle(page);
    const initialMobile = await collect(page);
    screenshots.mobile = await saveImage('mobile.png');
    const mobileTraversal = await traverse(initialMobile, true);
    const mobile = mobileTraversal.snapshot;
    if (traversed.coverage.coverage < 1 || !traversed.coverage.reachedBottom)
      warnings.add(
        'Limitação: percurso desktop parcial; consulte as faixas e os checkpoints observados.',
      );
    if (mobileTraversal.coverage.coverage < 1)
      warnings.add('Limitação: amostragem de scroll no celular contém intervalos não observados.');
    return {
      desktop,
      mobile,
      frames: traversed.frames,
      mobileFrames: mobileTraversal.frames,
      screenshots,
      visualStates: visual,
      canvasRegions: desktop.elements
        .filter((e) => e.tag === 'canvas')
        .map((e) => ({
          id: e.id,
          type: 'canvas',
          rect: e.rect,
          position: e.styles.position || '',
          zIndex: e.styles.zIndex || '',
          opacity: e.styles.opacity || '',
          transform: e.styles.transform || '',
          visualStateObserved: visual.some((s) => s.id === e.id && s.visualStateObserved),
        })),
      captureCoverage: {
        pageHeight: desktop.pageHeight,
        pageWidth: desktop.pageWidth || desktop.width,
        dom: {
          sampledElements: desktop.elements.length,
          initialElements,
          addedElements: desktop.elements.length - initialElements,
          truncated: desktop.truncated,
        },
        scroll: traversed.coverage,
        mobile: {
          ...mobileTraversal.coverage,
          pageHeight: mobile.pageHeight,
          sampledElements: mobile.elements.length,
          truncated: mobile.truncated,
        },
        screenshots: {
          coverage: screenshots.fullPage
            ? 1
            : intervalCoverage(
                screenshots.segments.map((s) => [s.startY, s.endY]),
                desktop.pageHeight,
              ),
          horizontalCoverage: screenshots.fullPage
            ? 1
            : Math.min(1, desktop.width / (desktop.pageWidth || desktop.width)),
        },
        motion: {
          checkpoints: traversed.frames.length,
          canvasRegions: desktop.elements.filter((e) => e.tag === 'canvas').length,
          visualSamples: visual.filter((s) => s.visualStateObserved).length,
          limited:
            visualLimited ||
            desktop.elements.some(
              (e) =>
                e.tag === 'canvas' && !visual.some((s) => s.id === e.id && s.visualStateObserved),
            ),
        },
      },
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
