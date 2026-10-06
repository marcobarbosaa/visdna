import type { Finding } from './types.js';

// Shared scoring policy: equal-weight independent signals, 0..1 support.
// A minimum of two signals and 0.55 mean support is required; sample reliability
// reaches 1 at four observations. These are heuristic scores, not probabilities.
export const POLICY = {
  minimum: 0.55,
  observations: 4,
  colorDistance: 0.035,
  alphaDistance: 0.03,
  maxColors: 256,
  maxAncestors: 32,
  maxDescendants: 240,
} as const;
export interface Signal {
  support: number;
  evidence: string;
}
export function finding<T>(value: T | null, signals: Signal[], observations = 1): Finding<T> {
  const support = signals.length
    ? signals.reduce((n, s) => n + Math.max(0, Math.min(1, s.support)), 0) / signals.length
    : 0;
  if (value === null || signals.filter((s) => s.support > 0).length < 2 || support < POLICY.minimum)
    return { value: null, confidence: 0, evidence: ['Insufficient independent evidence'] };
  const reliability = 0.6 + 0.4 * Math.min(1, Math.max(0, observations) / POLICY.observations);
  return {
    value,
    confidence: Math.round(support * reliability * 100) / 100,
    evidence: signals.filter((s) => s.support > 0).map((s) => s.evidence),
  };
}
export const signal = (support: number, evidence: string): Signal => ({ support, evidence });
export const unknown = <T>(): Finding<T> => finding<T>(null, []);
