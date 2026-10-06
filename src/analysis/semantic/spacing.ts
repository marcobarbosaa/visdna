import type { SemanticContext, SpacingSystem } from './types.js';
import { finding, signal, unknown } from './confidence.js';
import { interactive, px } from './context.js';
export function analyzeSpacing(ctx: SemanticContext): SpacingSystem {
  const contexts: SpacingSystem['contexts'] = {};
  const all = new Map<number, number>();
  const counts = new Map<string, Map<number, number>>();
  for (const e of ctx.elements)
    for (const key of [
      'paddingTop',
      'paddingBottom',
      'paddingLeft',
      'paddingRight',
      'marginTop',
      'marginBottom',
      'marginLeft',
      'marginRight',
      'rowGap',
      'columnGap',
    ]) {
      const value = px(e.styles[key]);
      if (value <= 0 || value > 400) continue;
      const n = Math.round(value / 2) * 2;
      if (n === 0) continue;
      const kind = interactive(e)
        ? 'component'
        : ['section', 'header', 'footer', 'main'].includes(e.tag) && /Top|Bottom/.test(key)
          ? 'section'
          : e.children > 0 && key.startsWith('padding')
            ? 'container'
            : /Left|Right|columnGap/.test(key)
              ? 'inline'
              : 'component';
      const map = counts.get(kind) || new Map<number, number>();
      map.set(n, (map.get(n) || 0) + 1);
      counts.set(kind, map);
      all.set(n, (all.get(n) || 0) + 1);
    }
  for (const [kind, map] of counts)
    contexts[kind] = [...map]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([value, count]) => ({ value, count }));
  const recurring = [...all].filter(([, n]) => n >= 2).sort((a, b) => a[0] - b[0]);
  const total = [...all.values()].reduce((a, b) => a + b, 0);
  // Largest common useful unit with >=85% weighted support; two px is fallback,
  // never infer a scale from one repeated value.
  const candidates = [8, 4, 2].map((unit) => ({
    unit,
    support:
      [...all].filter(([v]) => v % unit === 0).reduce((n, [, c]) => n + c, 0) / Math.max(1, total),
  }));
  const best = candidates.find((c) => c.support >= 0.85);
  const baseUnit =
    best && recurring.length >= 3
      ? finding(
          best.unit,
          [
            signal(
              best.support,
              `${Math.round(best.support * 100)}% spacing observations align to ${best.unit}px`,
            ),
            signal(
              Math.min(1, recurring.length / 5),
              `${recurring.length} distinct recurring spacings`,
            ),
          ],
          total,
        )
      : unknown<number>();
  const tokens: SpacingSystem['tokens'] = {};
  // Numeric names avoid pretending that a five-level named scale exists.
  for (const [n, count] of recurring.slice(0, 24))
    tokens[`space${n}`] = finding(
      n,
      [
        signal(1, `${count} spacing observations`),
        signal(
          baseUnit.value && n % baseUnit.value === 0 ? 1 : 0.6,
          'Observed pixel spacing; no missing scale steps fabricated',
        ),
      ],
      count,
    );
  return {
    baseUnit,
    dominant: [...all]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([n]) => n),
    tokens,
    contexts,
  };
}
