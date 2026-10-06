import type { Finding, TokenReference, VisualDNAV2 } from './types.js';
import { finding, signal } from './confidence.js';
import type { SemanticContext } from './types.js';
export function styleTokens(
  ctx: SemanticContext,
  key: string,
  prefix: string,
): Record<string, Finding<string>> {
  const counts = new Map<string, number>();
  for (const e of ctx.elements) {
    const v = e.styles[key];
    if (!v || v === 'none' || /^(0px\s*)+$/.test(v)) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return Object.fromEntries(
    [...counts]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([value, count], i) => [
        `${prefix}${i + 1}`,
        finding(
          value,
          [signal(1, `${count} repeated ${key} declarations`), signal(1, 'Nonzero computed style')],
          count,
        ),
      ]),
  );
}
export function reference(
  value: string | number,
  tokens: VisualDNAV2['tokens'],
  category: keyof VisualDNAV2['tokens'],
): TokenReference {
  const match = Object.entries(tokens[category]).find(([, f]) => f.value === value);
  return { token: match ? `${category}.${match[0]}` : null, resolved: value };
}
