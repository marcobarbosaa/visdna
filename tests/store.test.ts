import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store, saveRawAnalysis } from '../src/storage/store.js';
import { buildAnalysis } from '../src/analysis/dna.js';
import { semanticFixture } from './semantic-fixture.js';
test('persistence, interrupted recovery, retention and path traversal protection', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'visdna-'));
  try {
    const store = new Store(dir);
    await store.init();
    const id = randomUUID();
    await store.save({
      id,
      url: 'https://example.com',
      domain: 'example.com',
      createdAt: new Date().toISOString(),
      stage: 'opening',
    });
    await writeFile(join(store.dir(id), 'analysis.raw.tmp'), 'interrupted');
    await store.init();
    await assert.rejects(stat(join(store.dir(id), 'analysis.raw.tmp')));
    assert.equal((await store.get(id))?.stage, 'error');
    assert.throws(() => store.dir('../../etc/passwd'));
    await store.save({
      id: randomUUID(),
      url: 'https://example.com',
      domain: 'example.com',
      createdAt: '2000-01-01T00:00:00Z',
      stage: 'complete',
    });
    await store.prune();
    assert.equal((await store.list()).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('V1 and V2 records coexist; RAW is persisted separately and removed with expired record', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'visdna-v2-store-'));
  try {
    const store = new Store(dir);
    await store.init();
    const { raw, dna } = buildAnalysis(semanticFixture(), 'https://fixture.example');
    const v1 = randomUUID(),
      v2 = randomUUID();
    const record = {
      url: 'https://fixture.example',
      domain: 'fixture.example',
      createdAt: new Date().toISOString(),
      stage: 'complete' as const,
    };
    await store.save({ ...record, id: v1, dna: raw.normalized });
    await store.save({ ...record, id: v2, dna });
    await saveRawAnalysis(store.dir(v2), raw);
    await writeFile(join(store.dir(v2), 'segment-001.jpg'), 'image');
    assert.equal((await store.get(v1))?.dna?.schemaVersion, '1.0');
    assert.equal((await store.get(v2))?.dna?.schemaVersion, '2.0');
    assert.equal(await store.raw(v1), null);
    assert.deepEqual(await store.raw(v2), raw);
    assert(!JSON.stringify(await store.get(v2)).includes('analysis.raw'));
    assert.equal(await store.raw('../../outside'), null);
    await store.save({ ...record, id: v2, dna, createdAt: '2000-01-01T00:00:00Z' });
    await store.prune();
    assert.equal(await store.raw(v2), null);
    assert.equal(await store.image(v2, 'segment-001.jpg'), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
