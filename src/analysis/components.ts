import type { ElementSample, Component } from '../types.js';
export function components(elements: ElementSample[]): Component[] {
  const counts = new Map<string, number>();
  const signature = (e: ElementSample) =>
    [e.tag, e.styles.backgroundColor, e.styles.borderRadius, e.styles.padding, e.children].join(
      '|',
    );
  for (const e of elements) counts.set(signature(e), (counts.get(signature(e)) || 0) + 1);
  return elements
    .flatMap((e): Component[] => {
      let type = '',
        confidence = 0.9;
      const evidence: string[] = [];
      if (e.tag === 'nav' || e.role === 'navigation') type = 'navbar';
      else if (e.tag === 'footer') type = 'footer';
      else if (
        e.tag === 'button' ||
        e.role === 'button' ||
        (e.tag === 'a' &&
          parseFloat(e.styles.paddingTop || '0') > 5 &&
          e.styles.backgroundColor !== 'rgba(0, 0, 0, 0)')
      )
        type = 'button';
      else if (['input', 'textarea', 'select'].includes(e.tag)) type = 'input';
      else if (e.tag === 'form') type = 'form';
      else if (e.tag === 'details') type = 'FAQ';
      else if (e.rect.y < 900 && ['section', 'header'].includes(e.tag) && e.rect.height > 250) {
        type = 'hero';
        confidence = 0.65;
        evidence.push('Large section near page top');
      } else if (
        e.children > 0 &&
        e.children < 12 &&
        e.rect.width > 140 &&
        e.rect.height > 80 &&
        parseFloat(e.styles.borderRadius || '0') > 0 &&
        (counts.get(signature(e)) || 0) >= 3
      ) {
        type = 'card';
        confidence = 0.65;
        evidence.push('Repeated structural and style signature');
      }
      if (!type) return [];
      evidence.push(`tag=${e.tag}`, `role=${e.role || 'unspecified'}`);
      const keys = [
        'backgroundColor',
        'color',
        'border',
        'borderRadius',
        'boxShadow',
        'padding',
        'display',
        'gap',
        'fontSize',
        'fontWeight',
      ];
      return [
        {
          type,
          elementId: e.id,
          confidence,
          evidence,
          rect: e.rect,
          styles: Object.fromEntries(keys.map((k) => [k, e.styles[k] || ''])),
        },
      ];
    })
    .slice(0, 100);
}
