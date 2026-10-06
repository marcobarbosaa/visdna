import { test } from 'node:test';
import { get } from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Store, saveRawAnalysis } from '../src/storage/store.js';
import { buildAnalysis } from '../src/analysis/dna.js';
import { semanticFixture } from './semantic-fixture.js';

test(
  'HTTP API serves UI and blocks private URLs, origins and hostile Host headers',
  { timeout: 15000 },
  async () => {
    const data = await mkdtemp(join(tmpdir(), 'visdna-api-'));
    const port = 47000 + Math.floor(Math.random() * 1000);
    const child = spawn(process.execPath, ['dist/src/server.js'], {
      env: { ...process.env, PORT: String(port), VISDNA_DATA: data },
      stdio: 'ignore',
    });
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    const base = `http://127.0.0.1:${port}`;
    try {
      let ready = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        try {
          ready = (await fetch(`${base}/api/health`)).ok;
        } catch {
          /* Wait for startup. */
        }
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert(ready, 'server should start');
      assert.equal((await fetch(base)).status, 200);
      const post = (url: string, extra: Record<string, string> = {}) =>
        fetch(`${base}/api/analyses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...extra },
          body: JSON.stringify({ url }),
        });
      assert.equal((await post('http://127.0.0.1')).status, 400);
      assert.equal(
        (await post('https://example.com', { Origin: 'https://evil.example' })).status,
        403,
      );
      assert.equal(
        await new Promise<number>((resolve, reject) => {
          get(`${base}/api/health`, { headers: { Host: 'evil.example' } }, (response) => {
            response.resume();
            resolve(response.statusCode || 0);
          }).on('error', reject);
        }),
        403,
      );
      assert.equal((await fetch(`${base}/api/analyses/not-a-real-id`)).status, 404);
      assert.deepEqual(await (await fetch(`${base}/api/analyses`)).json(), []);
      const store = new Store(data),
        id = randomUUID(),
        oldId = randomUUID();
      const { dna, raw } = buildAnalysis(semanticFixture(), 'https://fixture.example');
      const record = {
        url: 'https://fixture.example',
        domain: 'fixture.example',
        createdAt: new Date().toISOString(),
        stage: 'complete' as const,
      };
      await store.save({ ...record, id, dna });
      await saveRawAnalysis(store.dir(id), raw);
      await writeFile(join(store.dir(id), 'segment-001.jpg'), Buffer.from('fixture'));
      await store.save({
        ...record,
        id,
        dna,
        artifacts: {
          desktop: true,
          mobile: true,
          fullPage: true,
          raw: true,
          segments: [{ index: 1, file: 'segment-001.jpg', startY: 900, endY: 1800, width: 1440 }],
        },
      });
      const actual = await (await fetch(`${base}/api/analyses/${id}`)).json();
      assert.equal(actual.artifacts.desktop, false);
      assert.equal(actual.artifacts.fullPage, false);
      assert.equal(actual.artifacts.raw, true);
      assert.equal(actual.artifacts.segments.length, 1);
      assert.equal((await fetch(`${base}/api/analyses/${id}/images/segment-001.jpg`)).status, 200);
      assert.equal((await fetch(`${base}/api/analyses/${id}/images/segment-020.jpg`)).status, 404);
      await rm(join(store.dir(id), 'segment-001.jpg'));
      assert.equal(
        (await (await fetch(`${base}/api/analyses/${id}`)).json()).artifacts.segments.length,
        0,
      );
      assert.equal(
        (await (await fetch(`${base}/api/analyses`)).json())[0].artifacts.segments.length,
        0,
      );
      await store.save({ ...record, id: oldId, dna: raw.normalized });
      const download = await fetch(`${base}/api/analyses/${id}/dna`);
      assert(download.headers.get('content-disposition')?.includes('attachment'));
      assert.deepEqual(await download.json(), dna);
      assert.deepEqual(await (await fetch(`${base}/api/analyses/${id}/raw`)).json(), raw);
      assert.equal((await fetch(`${base}/api/analyses/${oldId}/raw`)).status, 404);
      assert.equal(
        (await (await fetch(`${base}/api/analyses/${oldId}/dna`)).json()).schemaVersion,
        '1.0',
      );
      assert.equal((await fetch(`${base}/api/analyses/not-a-real-id/raw`)).status, 404);
      assert.equal((await (await fetch(`${base}/api/analyses`)).json()).length, 2);
      assert.equal(
        (await fetch(`${base}/api/health`)).headers.get('x-content-type-options'),
        'nosniff',
      );
    } finally {
      child.kill();
      await exited;
      await rm(data, { recursive: true, force: true });
    }
  },
);
