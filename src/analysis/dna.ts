import type { Capture, Stage } from '../types.js';
import { buildRawDNA } from './raw.js';
import { analyzeSemantic } from './semantic/index.js';
import type { RawAnalysis, VisualDNAV2 } from './semantic/types.js';
export function buildAnalysis(
  capture: Capture,
  url: string,
  stage: (s: Stage) => void = () => {},
): { raw: RawAnalysis; dna: VisualDNAV2 } {
  const normalized = buildRawDNA(capture, url, stage);
  return {
    raw: { schemaVersion: 'raw-2.0', capture, normalized },
    dna: analyzeSemantic(capture, normalized),
  };
}
export function buildDNA(
  capture: Capture,
  url: string,
  stage: (s: Stage) => void = () => {},
): VisualDNAV2 {
  return buildAnalysis(capture, url, stage).dna;
}
