import type { Snapshot } from '../../types.js';
import type { ColorFamily, Finding, SemanticContext } from './types.js';
import { parseColor, colorDistance, contrast, type ParsedColor } from './color-space.js';
import { finding, signal, unknown, POLICY } from './confidence.js';
import { interactive, actionContext, px } from './context.js';

interface Usage {
  color: ParsedColor;
  count: number;
  backgrounds: number;
  text: number;
  border: number;
  actions: number;
  links: number;
  emphasis: number;
  badges: number;
  regions: Set<string>;
  cells: Set<number>;
  body: boolean;
  surfaces: number;
  actionIds: Set<string>;
}
function usage(color: ParsedColor): Usage {
  return {
    color,
    count: 0,
    backgrounds: 0,
    text: 0,
    border: 0,
    actions: 0,
    links: 0,
    emphasis: 0,
    badges: 0,
    surfaces: 0,
    actionIds: new Set(),
    regions: new Set(),
    cells: new Set(),
    body: false,
  };
}
export function clusterColors(values: { color: ParsedColor; count: number }[]) {
  const clusters: { color: ParsedColor; members: string[]; count: number }[] = [];
  const sorted = [...values].sort(
    (a, b) => b.count - a.count || a.color.value.localeCompare(b.color.value),
  );
  for (const item of sorted.slice(0, POLICY.maxColors)) {
    const group = clusters.find(
      (g) =>
        Math.abs(g.color.alpha - item.color.alpha) <= POLICY.alphaDistance &&
        colorDistance(g.color, item.color) <= POLICY.colorDistance,
    );
    if (group) {
      group.members.push(item.color.value);
      group.count += item.count;
    } else clusters.push({ color: item.color, members: [item.color.value], count: item.count });
  }
  return clusters;
}
export function analyzeColors(
  snapshot: Snapshot,
  ctx: SemanticContext,
): { palette: ColorFamily[]; roles: Record<string, Finding<string>> } {
  const usages = new Map<string, Usage>();
  const cache = new Map<string, ParsedColor | null>();
  const parse = (s: string) => {
    if (!cache.has(s)) cache.set(s, parseColor(s));
    return cache.get(s)!;
  };
  const rows = 64,
    cols = 32,
    pageHeight = Math.max(snapshot.height, snapshot.pageHeight);
  // Background paint proxy: last DOM box wins on a bounded coarse page grid.
  // It avoids adding overlapping ancestor/child areas, but cannot model z-index or images.
  const paint: (string | undefined)[] = new Array(rows * cols);
  for (const e of ctx.elements) {
    for (const key of ['backgroundColor', 'color', 'borderColor'] as const) {
      if (key === 'color' && (e.textLength === 0 || e.children > 0)) continue;
      if (key === 'borderColor' && px(e.styles.borderWidth) <= 0) continue;
      const color = parse(e.styles[key] || '');
      if (!color) continue;
      const u = usages.get(color.value) || usage(color);
      usages.set(color.value, u);
      u.count++;
      u.regions.add(ctx.region.get(e.id) || e.id);
      if (key === 'backgroundColor') {
        u.backgrounds++;
        if (e.tag === 'body') u.body = true;
        if (
          e.tag !== 'body' &&
          !interactive(e) &&
          e.children > 0 &&
          e.rect.width >= 140 &&
          e.rect.height >= 80
        )
          u.surfaces++;
        const x0 = Math.max(0, Math.floor((e.rect.x / snapshot.width) * cols)),
          x1 = Math.min(cols, Math.ceil(((e.rect.x + e.rect.width) / snapshot.width) * cols));
        const y0 = Math.max(0, Math.floor((e.rect.y / pageHeight) * rows)),
          y1 = Math.min(rows, Math.ceil(((e.rect.y + e.rect.height) / pageHeight) * rows));
        if (color.alpha >= 0.9)
          for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) paint[y * cols + x] = color.value;
      }
      if (key === 'color') {
        u.text++;
        if (Number(e.styles.fontWeight) >= 600) u.emphasis++;
      }
      if (key === 'borderColor') u.border++;
      const action = actionContext(e, ctx);
      if (action && key !== 'borderColor') {
        u.actionIds.add(action.id);
        u.actions = u.actionIds.size;
        if (action.tag === 'a') u.links++;
      }
      if (
        e.children === 0 &&
        e.rect.height <= 40 &&
        e.rect.width <= 160 &&
        px(e.styles.borderRadius) > 0
      )
        u.badges++;
    }
  }
  paint.forEach((v, i) => {
    if (v) usages.get(v)?.cells.add(i);
  });
  const clusters = clusterColors(
    [...usages.values()].map((u) => ({ color: u.color, count: u.count })),
  );
  const groups = clusters.map((g) => {
    const merged = usage(g.color);
    for (const m of g.members) {
      const u = usages.get(m)!;
      for (const key of [
        'count',
        'backgrounds',
        'text',
        'border',
        'actions',
        'links',
        'emphasis',
        'badges',
        'surfaces',
      ] as const)
        merged[key] += u[key];
      for (const r of u.regions) merged.regions.add(r);
      for (const c of u.cells) merged.cells.add(c);
      merged.body ||= u.body;
    }
    const coverageRepresentative = g.members
      .map((m) => usages.get(m)!)
      .sort(
        (a, b) =>
          b.cells.size - a.cells.size ||
          b.count - a.count ||
          a.color.value.localeCompare(b.color.value),
      )[0]!;
    for (const m of g.members) for (const id of usages.get(m)!.actionIds) merged.actionIds.add(id);
    merged.actions = merged.actionIds.size;
    merged.color = coverageRepresentative.color;
    return { ...merged, members: g.members };
  });
  const total = [...usages.values()].reduce((n, u) => n + u.count, 0);
  const palette = groups.map((g) => ({
    value: g.color.value,
    members: g.members,
    count: g.count,
    occurrenceFrequency: Math.round((g.count / Math.max(1, total)) * 1000) / 10,
    visualCoverageEstimate: Math.round((g.cells.size / (rows * cols)) * 1000) / 10,
    luminance: g.color.luminance,
    chroma: g.color.chroma,
  }));
  const roles: Record<string, Finding<string>> = Object.fromEntries(
    [
      'background',
      'surface',
      'surfaceSecondary',
      'primary',
      'secondary',
      'accent',
      'textPrimary',
      'textSecondary',
      'muted',
      'border',
      'success',
      'warning',
      'danger',
    ].map((r) => [r, unknown<string>()]),
  );
  const backgrounds = groups
    .filter((g) => g.backgrounds && g.color.alpha >= 0.9)
    .sort((a, b) => b.cells.size - a.cells.size || b.backgrounds - a.backgrounds);
  const bg = backgrounds[0];
  if (bg)
    roles.background = finding(
      bg.color.value,
      [
        signal(
          bg.cells.size / (rows * cols),
          `${bg.cells.size}/${rows * cols} page cells covered by opaque backgrounds`,
        ),
        signal(bg.body || bg.backgrounds >= 2 ? 1 : 0, 'Body background or repeated background'),
      ],
      bg.backgrounds,
    );
  for (const [i, role] of ['surface', 'surfaceSecondary'].entries()) {
    const g = [...usages.values()]
      .filter((g) => g.surfaces >= 2 && g.color.alpha >= 0.9)
      .sort((a, b) => b.surfaces - a.surfaces || b.cells.size - a.cells.size)[i];
    if (g)
      roles[role] = finding(
        g.color.value,
        [
          signal(Math.min(1, g.surfaces / 3), `${g.surfaces} structural surface backgrounds`),
          signal(1, 'Repeated content boxes; interactive backgrounds excluded'),
        ],
        g.surfaces,
      );
  }
  const texts = groups
    .filter((g) => g.text && g.color.alpha >= 0.9)
    .sort((a, b) => b.text - a.text || a.color.value.localeCompare(b.color.value));
  for (const [i, role] of ['textPrimary', 'textSecondary'].entries()) {
    const g = texts[i];
    if (g)
      roles[role] = finding(
        g.color.value,
        [
          signal(Math.min(1, g.text / 3), `${g.text} leaf text occurrences`),
          signal(
            bg ? Math.min(1, contrast(g.color, bg.color) / 4.5) : 0,
            'Contrast against dominant background',
          ),
        ],
        g.text,
      );
  }
  const rank = (g: Usage) => g.actions * 3 + g.links + g.emphasis + g.badges + g.regions.size * 2;
  const chromatic = groups
    .filter((g) => g.color.chroma >= 0.055 && g.color.alpha >= 0.9)
    .sort((a, b) => rank(b) - rank(a) || a.color.value.localeCompare(b.color.value));
  const action = chromatic.filter((g) => g.actions >= 2);
  for (const [i, role] of ['primary', 'secondary'].entries()) {
    if (action.length > 1 && rank(action[0]!) < rank(action[1]!) * 1.2) continue;
    const g = action[i];
    if (g)
      roles[role] = finding(
        g.color.value,
        [
          signal(Math.min(1, g.actions / 4), `${g.actions} interactive color occurrences`),
          signal(
            Math.min(1, g.regions.size / 2),
            `Repeated in ${g.regions.size} structural regions`,
          ),
          signal(
            bg ? Math.min(1, contrast(g.color, bg.color) / 3) : 0,
            'Chromatic contrast against dominant background',
          ),
        ],
        g.actions,
      );
  }
  const accents = chromatic.filter(
    (g) => g.count >= 3 && g.regions.size >= 2 && g.actions + g.emphasis + g.badges >= 2,
  );
  const accent = accents.find((g) => g.color.value !== roles.primary?.value) || accents[0];
  if (accent)
    roles.accent = finding(
      accent.color.value,
      [
        signal(1, `Chromatic emphasis repeated in ${accent.regions.size} regions`),
        signal(
          Math.min(1, (accent.actions + accent.emphasis + accent.badges) / 4),
          'Interactive, emphasized text or badge use',
        ),
        signal(
          bg ? Math.min(1, contrast(accent.color, bg.color) / 3) : 0,
          'Contrast against dominant background',
        ),
      ],
      accent.count,
    );
  const border = groups.filter((g) => g.border >= 2).sort((a, b) => b.border - a.border)[0];
  if (border)
    roles.border = finding(
      border.color.value,
      [
        signal(1, `${border.border} visible-width border occurrences`),
        signal(1, 'Repeated border color'),
      ],
      border.border,
    );
  const muted = texts.find(
    (g) =>
      g !== texts[0] &&
      g.color.chroma < 0.04 &&
      g.text >= 2 &&
      bg &&
      contrast(g.color, bg.color) < contrast(texts[0]!.color, bg.color),
  );
  if (muted)
    roles.muted = finding(
      muted.color.value,
      [signal(1, 'Repeated neutral secondary text'), signal(1, 'Lower contrast than primary text')],
      muted.text,
    );
  // Hue alone never implies success/warning/danger; no reliable state metadata is collected.
  return { palette, roles };
}
