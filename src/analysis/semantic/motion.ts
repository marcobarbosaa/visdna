import type { Capture } from '../../types.js';
import type { VisualDNAV2, MotionPattern } from './types.js';
import { finding, signal } from './confidence.js';
import { interactive } from './context.js';
import { visualDifference } from '../../browser/visual.js';
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
    const samples = frames.map((f) => f.get(e.id)).filter((f) => f !== undefined);
    for (const position of new Set(
      [e.styles.position, ...samples.map((s) => s.position)].filter(
        (p) => p === 'sticky' || p === 'fixed',
      ),
    ))
      add(e.id, position!, null, null, [
        'Computed positioning mode',
        'Positioning declaration observed',
      ]);
    for (const key of ['opacity', 'transform', 'filter'] as const)
      if (samples.length >= 2 && new Set(samples.map((f) => f[key])).size > 1)
        add(e.id, `observed-${key}-change`, null, null, [
          `${samples.length} scroll-time observations`,
          'Values differ; temporal animation remains an alternative cause',
        ]);
  }
  const tokens: VisualDNAV2['motion']['tokens'] = {};
  const visualById = new Map<string, NonNullable<Capture['visualStates']>>();
  for (const state of capture.visualStates || []) {
    const states = visualById.get(state.id) || [];
    states.push(state);
    visualById.set(state.id, states);
  }
  for (const [id, states] of visualById) {
    const arrivals = states.filter((s) => s.phase === 'arrival' && s.signature);
    let changed = 0,
      stableControls = 0,
      comparable = 0;
    for (let i = 1; i < arrivals.length; i++) {
      const a = arrivals[i - 1]!,
        b = arrivals[i]!;
      const a2 = states.find(
        (s) => s.checkpoint === a.checkpoint && s.phase === 'settled' && s.signature,
      );
      if (
        !a2 ||
        b.scrollY <= a.scrollY ||
        Math.abs(a.rect.width - b.rect.width) > 2 ||
        Math.abs(a.rect.height - b.rect.height) > 2
      )
        continue;
      comparable++;
      const temporal = visualDifference(a.signature!, a2.signature!),
        delta = visualDifference(a2.signature!, b.signature!);
      if (delta >= 0.035) {
        changed++;
        if (
          temporal < 0.015 &&
          Math.abs(a.scrollY - a2.scrollY) < 1 &&
          Math.abs(a.rect.width - a2.rect.width) < 2 &&
          Math.abs(a.rect.height - a2.rect.height) < 2
        )
          stableControls++;
      }
    }
    if (changed) {
      add(id, 'canvas-visual-change', null, null, [
        `Canvas pixels differ in ${changed} of ${comparable} comparable checkpoint pairs`,
        'Reduced screenshot RGB difference; does not identify canvas content',
      ]);
      if (stableControls >= 2 && stableControls / changed >= 0.75) {
        add(id, 'scroll-reactive-region', null, null, [
          `${stableControls} stable no-scroll controls precede changed scroll observations`,
          'Scroll association is supported; temporal and occlusion causes remain possible',
        ]);
        groups.get(['scroll-reactive-region', null, null].join('|'))!.pattern.confidence = 0.82;
      }
    }
  }
  for (const e of capture.desktop.elements) {
    const samples = capture.frames.flatMap((f, index) => {
      const s = frames[index]!.get(e.id);
      return s &&
        ['fixed', 'sticky'].includes(s.position) &&
        f.scrollY !== undefined &&
        s.y - f.scrollY >= -2 &&
        s.y - f.scrollY < capture.desktop.height
        ? [{ ...s, scrollY: f.scrollY }]
        : [];
    });
    const range = samples.length ? samples.at(-1)!.scrollY - samples[0]!.scrollY : 0;
    const sections = new Set(
      capture.frames
        .filter((f) => samples.some((s) => s.scrollY === f.scrollY))
        .flatMap((f) => f.sectionIds || []),
    );
    const graphic = ['canvas', 'img', 'video', 'svg'].includes(e.tag);
    const changing =
      new Set(samples.map((s) => `${s.opacity}|${s.transform}|${s.filter}`)).size > 1;
    if (
      samples.length >= 3 &&
      range >= Math.max(capture.desktop.height * 2, capture.desktop.pageHeight * 0.4) &&
      (graphic || changing) &&
      sections.size >= 2
    )
      add(e.id, 'persistent-scroll-visual', null, null, [
        `Graphic remained in viewport across ${samples.length} checkpoints and ${sections.size} regions`,
        `Observed scroll span ${Math.round(range)}px; positioning does not prove scroll causality`,
      ]);
  }
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
      'Declared transitions and animations are separated from observed changes. Stable no-scroll controls support association, never absolute scroll causality; clipping, occlusion and elapsed time remain alternatives.',
  };
}
