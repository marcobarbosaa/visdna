import { mkdir, readFile, readdir, writeFile, rename, rm, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import type { AnalysisRecord } from '../types.js';
import type { RawAnalysis } from '../analysis/semantic/types.js';
export async function saveRawAnalysis(dir: string, raw: RawAnalysis) {
  try {
    await writeFile(join(dir, 'analysis.raw.tmp'), JSON.stringify(raw), { mode: 0o600 });
    await rename(join(dir, 'analysis.raw.tmp'), join(dir, 'analysis.raw.json'));
  } finally {
    await rm(join(dir, 'analysis.raw.tmp'), { force: true });
  }
}
export class Store {
  readonly root: string;
  constructor(root = process.env.VISDNA_DATA || 'data') {
    this.root = resolve(root);
  }
  dir(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid ID');
    return join(this.root, id);
  }
  async init() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    for (const r of await this.list()) {
      for (const name of ['record.tmp', 'analysis.raw.tmp'])
        await rm(join(this.dir(r.id), name), { force: true });
      if (!['complete', 'error'].includes(r.stage))
        await this.save({
          ...r,
          stage: 'error',
          error: 'A análise foi interrompida. Tente novamente.',
        });
    }
    await this.prune();
  }
  async save(record: AnalysisRecord) {
    const dir = this.dir(record.id);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    try {
      await writeFile(join(dir, 'record.tmp'), JSON.stringify(record), { mode: 0o600 });
      await rename(join(dir, 'record.tmp'), join(dir, 'record.json'));
    } finally {
      await rm(join(dir, 'record.tmp'), { force: true });
    }
  }
  async get(id: string): Promise<AnalysisRecord | null> {
    try {
      return JSON.parse(
        await readFile(join(this.dir(id), 'record.json'), 'utf8'),
      ) as AnalysisRecord;
    } catch {
      return null;
    }
  }
  async list() {
    const dirs = await readdir(this.root).catch(() => []);
    const records = await Promise.all(
      dirs.filter((d) => /^[a-f0-9-]{36}$/.test(d)).map((d) => this.get(d)),
    );
    return records.filter((r) => r !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async raw(id: string): Promise<RawAnalysis | null> {
    try {
      return JSON.parse(
        await readFile(join(this.dir(id), 'analysis.raw.json'), 'utf8'),
      ) as RawAnalysis;
    } catch {
      return null;
    }
  }
  async prune() {
    const records = await this.list();
    for (const [i, r] of records.entries())
      if (
        ['complete', 'error'].includes(r.stage) &&
        (i >= 30 || Date.now() - Date.parse(r.createdAt) > 7 * 86400000)
      )
        await rm(this.dir(r.id), { recursive: true, force: true });
  }
  async image(id: string, name: string) {
    if (
      !['main.png', 'full.png', 'mobile.png'].includes(name) &&
      !/^segment-0[01][0-9]\.jpg$/.test(name)
    )
      return null;
    const path = join(this.dir(id), name);
    return await stat(path)
      .then((s) => (s.isFile() && s.size > 0 ? path : null))
      .catch(() => null);
  }
  async artifacts(record: AnalysisRecord): Promise<NonNullable<AnalysisRecord['artifacts']>> {
    const [desktop, mobile, fullPage, raw] = await Promise.all([
      this.image(record.id, 'main.png'),
      this.image(record.id, 'mobile.png'),
      this.image(record.id, 'full.png'),
      stat(join(this.dir(record.id), 'analysis.raw.json'))
        .then((s) => s.isFile() && s.size > 0)
        .catch(() => false),
    ]);
    const segments = [];
    for (const segment of (record.artifacts?.segments || []).slice(0, 20))
      if (await this.image(record.id, segment.file)) segments.push(segment);
    return {
      desktop: !!desktop,
      mobile: !!mobile,
      fullPage: !!fullPage,
      raw: record.stage === 'complete' && raw,
      segments,
    };
  }
}
