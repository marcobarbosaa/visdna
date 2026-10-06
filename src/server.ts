import express from 'express';
import { randomUUID } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';
import { terminateTree } from './process.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { z } from 'zod';
import { Store } from './storage/store.js';
import { validateURL, resolvePublic, SafeError } from './security/url.js';
import type { AnalysisRecord, Stage, VisualDNA } from './types.js';
const port = Number(process.env.PORT || 4173);
const store = new Store();
await store.init();
const app = express();
let busy = false;
let activeChild: ChildProcess | undefined;
const stages = new Set<Stage>([
  'opening',
  'extracting',
  'scroll',
  'responsive',
  'colors',
  'typography',
  'components',
  'motion',
  'building',
  'complete',
  'error',
]);
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host || '')) {
    res.status(403).json({ error: 'Host não permitido.' });
    return;
  }
  const origin = req.headers.origin;
  if (origin && !['http://localhost:' + port, 'http://127.0.0.1:' + port].includes(origin)) {
    res.status(403).json({ error: 'Origem não permitida.' });
    return;
  }
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  });
  next();
});
app.use(express.json({ limit: '4kb' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, busy }));
app.get('/api/analyses', async (_req, res) =>
  res.json((await store.list()).map(({ dna, ...r }) => ({ ...r, hasDNA: !!dna }))),
);
app.get('/api/analyses/:id', async (req, res) => {
  const record = await store.get(req.params.id);
  if (!record) {
    res.status(404).json({ error: 'Análise não encontrada.' });
    return;
  }
  res.json(record);
});
app.get('/api/analyses/:id/dna', async (req, res) => {
  const record = await store.get(req.params.id);
  if (!record?.dna) {
    res.status(404).json({ error: 'Resultado indisponível.' });
    return;
  }
  res.attachment(`visdna-${record.domain}.json`).json(record.dna);
});
app.get('/api/analyses/:id/images/:name', async (req, res) => {
  try {
    const path = await store.image(req.params.id, req.params.name);
    if (path) res.sendFile(path);
    else res.sendStatus(404);
  } catch {
    res.sendStatus(404);
  }
});
app.get('/api/analyses/:id/raw', async (req, res) => {
  const record = await store.get(req.params.id);
  const raw = record?.stage === 'complete' ? await store.raw(req.params.id) : null;
  if (!raw) {
    res.status(404).json({ error: 'Análise RAW indisponível para este registro.' });
    return;
  }
  res.attachment('analysis.raw.json').json(raw);
});
app.post('/api/analyses', async (req, res) => {
  if (busy) {
    res.status(429).json({ error: 'Uma análise já está em andamento. Aguarde a conclusão.' });
    return;
  }
  busy = true;
  try {
    const { url: input } = z
      .object({ url: z.string().max(2048) })
      .strict()
      .parse(req.body);
    const url = validateURL(input);
    await resolvePublic(url);
    const record: AnalysisRecord = {
      id: randomUUID(),
      url: url.href,
      domain: url.hostname,
      createdAt: new Date().toISOString(),
      stage: 'queued',
    };
    await mkdir(store.dir(record.id), { recursive: true });
    await store.save(record);
    const workerPath = fileURLToPath(
      new URL(import.meta.url.endsWith('.ts') ? './worker.ts' : './worker.js', import.meta.url),
    );
    const child = fork(workerPath, [record.url, store.dir(record.id)], {
      execArgv: import.meta.url.endsWith('.ts') ? ['--import', 'tsx'] : [],
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    activeChild = child;
    let writes = Promise.resolve();
    let finished = false;
    let closed = false;
    const persist = () => {
      const snapshot = structuredClone(record);
      writes = writes.then(() => store.save(snapshot)).catch(() => {});
    };
    const timeout = setTimeout(() => {
      record.stage = 'error';
      record.error = 'Tempo máximo de análise atingido.';
      finished = true;
      persist();
      terminateTree(child);
    }, 75000);
    child.on('message', (message: { stage: Stage; dna?: VisualDNA; error?: string }) => {
      if (finished || !stages.has(message.stage)) return;
      record.stage = message.stage;
      if (message.dna) record.dna = message.dna;
      if (message.error) record.error = message.error;
      persist();
    });
    const finish = () => {
      if (closed) return;
      closed = true;
      activeChild = undefined;
      terminateTree(child);
      clearTimeout(timeout);
      if (!['complete', 'error'].includes(record.stage)) {
        record.stage = 'error';
        record.error = 'O processo de análise foi interrompido.';
        persist();
      }
      void writes.finally(async () => {
        busy = false;
        await store.prune();
      });
    };
    child.once('exit', finish);
    child.once('error', finish);
    res.status(202).json({ id: record.id });
  } catch (error) {
    busy = false;
    res.status(400).json({
      error:
        error instanceof SafeError
          ? error.message
          : 'Solicitação inválida ou serviço indisponível.',
    });
  }
});
app.use(express.static(resolve('web')));
app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    void error;
    void _next;
    res.status(400).json({ error: 'Requisição inválida.' });
  },
);
const cleanup = setInterval(() => void store.prune(), 3600000);
cleanup.unref();
app.listen(port, '127.0.0.1', () => console.log(`VisDNA: http://localhost:${port}`));

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    if (activeChild) terminateTree(activeChild);
    process.exit(0);
  });
