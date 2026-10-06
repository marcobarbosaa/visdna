import type { Finding, TokenReference, VisualDNAV2 } from './types.js';
import { finding, signal } from './confidence.js';
import type { SemanticContext } from './types.js';
import type { ElementSample } from '../../types.js';
export function semanticRadius(e: ElementSample): string {
  const raw = e.styles.borderRadius || '0px';
  const values = raw.split(/\s+/);
  if (!values.every((v) => /^\d+(\.\d+)?(px|%)$/.test(v))) return raw;
  const rounded = values.every((v) =>
    v.endsWith('%')
      ? parseFloat(v) >= 50
      : parseFloat(v) >= Math.min(e.rect.width, e.rect.height) / 2,
  );
  if (!rounded || Math.min(e.rect.width, e.rect.height) <= 0) return raw;
  return Math.abs(e.rect.width - e.rect.height) <= 2 ? 'circle' : 'pill';
}
export function styleTokens(
  ctx: SemanticContext,
  key: string,
  prefix: string,
): Record<string, Finding<string>> {
  const counts = new Map<string, number>();
  for (const e of ctx.elements) {
    const v = key === 'borderRadius' ? semanticRadius(e) : e.styles[key];
    if (!v || v === 'none' || /^(0px\s*)+$/.test(v)) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return Object.fromEntries(
    [...counts]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([value, count], i) => [
        value === 'pill' ? 'radiusPill' : value === 'circle' ? 'radiusCircle' : `${prefix}${i + 1}`,
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
  preferred: string[] = [],
): TokenReference {
  const entries = Object.entries(tokens[category]);
  const match =
    preferred
      .map((name) => entries.find(([key, f]) => key === name && f.value === value))
      .find(Boolean) || entries.find(([, f]) => f.value === value);
  return { token: match ? `${category}.${match[0]}` : null, resolved: value };
}
