// Manual validation uses the production worker, transport and 75-second supervisor deadline.
import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/storage/store.js';
import { terminateTree } from '../src/process.js';
import { validateURL } from '../src/security/url.js';
import type { AnalysisRecord } from '../src/types.js';

const url = validateURL(process.argv[2] || '');
const store = new Store();
await store.init();
const record: AnalysisRecord = {
  id: randomUUID(),
  url: url.href,
  domain: url.hostname,
  createdAt: new Date().toISOString(),
  stage: 'queued',
};
await store.save(record);
const child = fork(
  fileURLToPath(new URL('../src/worker.ts', import.meta.url)),
  [record.url, store.dir(record.id)],
  {
    execArgv: ['--import', 'tsx'],
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    windowsHide: true,
  },
);
let timer: ReturnType<typeof setTimeout> | undefined;
try {
  await new Promise<void>((resolve, reject) => {
    timer = setTimeout(() => {
      terminateTree(child);
      reject(new Error('Prazo máximo de 75 segundos atingido.'));
    }, 75000);
    child.on('message', (message: Partial<AnalysisRecord>) => {
      if (message.stage) {
        Object.assign(record, message);
        console.log(message.stage);
      }
    });
    child.once('error', reject);
    child.once('exit', () =>
      record.stage === 'complete'
        ? resolve()
        : reject(new Error(record.error || 'Worker interrompido.')),
    );
  });
} catch (error) {
  record.stage = 'error';
  record.error = String(error);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  terminateTree(child);
  await store.save(record);
  await store.prune();
}
console.log(
  JSON.stringify(
    {
      id: record.id,
      directory: store.dir(record.id),
      stage: record.stage,
      error: record.error,
      captureCoverage: record.captureCoverage,
      artifacts: await store.artifacts(record),
      motion: record.dna?.schemaVersion === '2.0' ? record.dna.motion.patterns : undefined,
    },
    null,
    2,
  ),
);
