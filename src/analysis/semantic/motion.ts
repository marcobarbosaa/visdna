import type { Capture } from '../../types.js';
import type { VisualDNAV2, MotionPattern } from './types.js';
import { finding, signal } from './confidence.js';
import { interactive } from './context.js';
// Split only outside timing-function parentheses.
const list = (s: string) => s.split(/,(?![^()]*\))/).map((v) => v.trim());
const ms = (s: string) =>
  /^\d*\.?\d+m?s$/.test(s) ? parseFloat(s) * (s.endsWith('ms') ? 1 : 1000) : 0;
export function analyzeMotion(capture: Capture): VisualDNAV2['motion'] {
  const groups = new Map<string, { pattern: MotionPattern; ids: Set<string> }>();
  const durations = new Map<number, Set<string>>();
  const frames = capture.frames.map((f) => new Map(f.elements.map((e) => [e.id, e])));
  const add = (
    id: string,
    type: string,
    duration: string | null,
    easing: string | null,
    evidence: string[],
  ) => {
    const key = [type, duration, easing].join('|');
    const f = finding(
      type,
      evidence.map((e) => signal(1, e)),
      1,
    );
    const group = groups.get(key) || {
      pattern: {
        type,
        duration,
        easing,
        instances: 0,
        confidence: f.confidence,
        evidence: f.evidence,
      },
      ids: new Set<string>(),
    };
    group.ids.add(id);
    group.pattern.instances = group.ids.size;
    group.pattern.confidence = finding(
      type,
      evidence.map((e) => signal(1, e)),
      group.ids.size,
    ).confidence;
    groups.set(key, group);
  };
  for (const e of capture.desktop.elements) {
    const properties = list(e.styles.transitionProperty || '');
    const times = list(e.styles.transitionDuration || '');
    const easings = list(e.styles.transitionTimingFunction || '');
    const shorthand = list(e.styles.transition || '');
    const length = properties[0] ? properties.length : shorthand.length;
    for (let i = 0; i < length; i++) {
      const text = shorthand[i] || '';
      const duration =
        ms(times[i % times.length] || '') ||
        ms(text.match(/(?:^|\s)(\d*\.?\d+m?s)(?:\s|$)/)?.[1] || '');
      if (duration <= 0) continue;
      const property = properties[i] || text.split(/\s+/)[0] || 'all';
      const easing =
        easings[i % easings.length] ||
        text.match(
          /cubic-bezier\([^)]*\)|steps\([^)]*\)|\bease(?:-in-out|-in|-out)?\b|\blinear\b/,
        )?.[0] ||
        'ease';
      const type =
        interactive(e) && ['color', 'background-color', 'border-color'].includes(property)
          ? 'interactive-color-transition'
          : `transition:${property}`;
      add(e.id, type, `${duration}ms`, easing, [
        'Positive computed transition duration',
        `Declared property ${property}; interaction was not triggered`,
      ]);
      const ids = durations.get(duration) || new Set<string>();
      ids.add(e.id);
      durations.set(duration, ids);
    }
    const names = list(e.styles.animationName || 'none');
    const animationTimes = list(e.styles.animationDuration || '');
    const animationEase = list(e.styles.animationTimingFunction || '');
    names.forEach((name, i) => {
      if (name === 'none') return;
      const duration = ms(animationTimes[i % animationTimes.length] || '');
      add(
        e.id,
        'declared-animation',
        duration ? `${duration}ms` : null,
        animationEase[i % animationEase.length] || null,
        ['Named CSS animation observed', 'Declaration does not prove playback or scroll causality'],
      );
    });
    if (['sticky', 'fixed'].includes(e.styles.position || ''))
      add(e.id, e.styles.position!, null, null, [
        'Computed positioning mode',
        'Positioning declaration observed',
      ]);
    const samples = frames.map((f) => f.get(e.id)).filter((f) => f !== undefined);
    for (const key of ['opacity', 'transform', 'filter'] as const)
      if (samples.length >= 2 && new Set(samples.map((f) => f[key])).size > 1)
        add(e.id, `observed-${key}-change`, null, null, [
          `${samples.length} scroll-time observations`,
          'Values differ; temporal animation remains an alternative cause',
        ]);
  }
  const tokens: VisualDNAV2['motion']['tokens'] = {};
  for (const [duration, ids] of [...durations].sort((a, b) => a[0] - b[0]))
    if (ids.size >= 2)
      tokens[`duration${duration}`] = finding(
        `${duration}ms`,
        [
          signal(1, `${ids.size} elements share this duration`),
          signal(1, 'Positive computed timing'),
        ],
        ids.size,
      );
  return {
    patterns: [...groups.values()]
      .map((g) => g.pattern)
      .sort((a, b) => b.instances - a.instances)
      .slice(0, 40),
    tokens,
    limitation:
      'Declared transitions and animations are separated from observed changes. No hover capture or scroll causality is inferred.',
  };
}
