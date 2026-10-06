import type { Token } from '../types.js';
export function normalizeColor(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v || v === 'transparent') return null;
  if (/^#[\da-f]{3}$/.test(v)) return '#' + [...v.slice(1)].map((c) => c + c).join('');
  if (/^#[\da-f]{6}$/.test(v)) return v;
  const m = v.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/);
  if (!m) return null;
  const rgb = m.slice(1, 4).map(Number);
  const alpha = m[4] === undefined ? 1 : Number(m[4]);
  if (rgb.some((n) => n < 0 || n > 255) || alpha < 0 || alpha > 1 || alpha === 0) return null;
  return (
    '#' +
    rgb.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('') +
    (alpha < 1
      ? Math.round(alpha * 255)
          .toString(16)
          .padStart(2, '0')
      : '')
  );
}
export function tokens(values: (string | null | undefined)[], limit = 24): Token[] {
  const counts = new Map<string, number>();
  for (const v of values)
    if (v && v !== 'none' && v !== 'normal' && v !== '0px') counts.set(v, (counts.get(v) || 0) + 1);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({
      value,
      count,
      frequency: Math.round((count / total) * 1000) / 10,
    }));
}
export function spacing(values: string[]): Token[] {
  return tokens(
    values
      .flatMap((v) => v.split(/\s+/))
      .map((v) => {
        if (!/^\d+(\.\d+)?px$/.test(v)) return null;
        const n = parseFloat(v);
        return n > 0 && n <= 400 ? `${Math.round(n / 2) * 2}px` : null;
      }),
  ).sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
}
