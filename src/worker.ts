import { capture } from './browser/engine.js';
import { buildAnalysis } from './analysis/dna.js';
import { saveRawAnalysis } from './storage/store.js';
import { SafeError } from './security/url.js';
const [url, dir] = process.argv.slice(2);
try {
  if (!url || !dir) throw new Error('Missing worker arguments');
  const stage = (stage: string) => process.send?.({ stage });
  const result = await capture(url, dir, stage);
  const { dna, raw } = buildAnalysis(result, url, stage);
  await saveRawAnalysis(dir, raw);
  process.send?.({ stage: 'complete', dna });
} catch (error) {
  process.send?.({
    stage: 'error',
    error:
      error instanceof SafeError
        ? error.message
        : 'Falha no navegador ou na análise. Confira a instalação do Chromium e o suporte ao sandbox.',
  });
} finally {
  process.disconnect?.();
}
