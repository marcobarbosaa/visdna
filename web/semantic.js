// V2 rendering uses the existing cards/tabs and never inserts remote HTML.
export function renderSemantic(panel, selected, dna, { el, card }) {
  const grid = el('div', undefined, 'grid');
  const describe = (f) =>
    f?.value === null || f?.value === undefined
      ? 'Unknown'
      : typeof f.value === 'object'
        ? JSON.stringify(f.value)
        : String(f.value);
  const evidence = (c, f) => {
    c.append(el('small', `Confidence ${Math.round((f.confidence || 0) * 100)}%`));
    for (const text of f.evidence || []) c.append(el('p', text, 'muted'));
  };
  const findings = (values) => {
    for (const [name, f] of Object.entries(values)) {
      const c = card(name, describe(f));
      evidence(c, f);
      grid.append(c);
    }
  };
  if (selected === 'Colors') {
    panel.append(
      el(
        'p',
        'Frequência de propriedades e cobertura estimada de fundos são métricas diferentes. Papéis sem evidência permanecem desconhecidos.',
        'notice',
      ),
    );
    for (const [role, f] of Object.entries(dna.colors.roles)) {
      const c = card(role, describe(f));
      if (f.value) {
        const swatch = el('div', undefined, 'swatch');
        swatch.style.backgroundColor = f.value;
        c.prepend(swatch);
      }
      evidence(c, f);
      grid.append(c);
    }
    for (const family of dna.colors.palette) {
      const c = card(
        family.value,
        `${family.count} occurrences · ${family.occurrenceFrequency}% frequency · ~${family.visualCoverageEstimate}% background coverage`,
      );
      const s = el('div', undefined, 'swatch');
      s.style.backgroundColor = family.value;
      c.prepend(s);
      c.append(el('small', `${family.members.length} clustered color values`));
      grid.append(c);
    }
  } else if (selected === 'Typography') {
    for (const [role, f] of Object.entries(dna.typography.roles)) {
      const c = card(role);
      if (f.value) {
        const t = f.value,
          p = el('p', 'The art of seeing.', 'sample');
        p.style.fontFamily = t.family;
        p.style.fontSize = t.size;
        p.style.fontWeight = t.weight;
        p.style.letterSpacing = t.tracking;
        c.append(p, el('code', `${t.family} · ${t.size} / ${t.weight} / ${t.lineHeight}`));
      } else c.append(el('code', 'Unknown'));
      evidence(c, f);
      grid.append(c);
    }
    findings(dna.typography.personality);
  } else if (selected === 'Spacing') {
    findings({ baseUnit: dna.spacing.baseUnit, ...dna.tokens.spacing });
    for (const [kind, values] of Object.entries(dna.spacing.contexts))
      grid.append(card(kind, values.map((v) => `${v.value}px (${v.count}×)`).join(' · ')));
  } else if (selected === 'Radius' || selected === 'Shadows') {
    findings(selected === 'Radius' ? dna.tokens.radius : dna.tokens.shadows);
  } else if (selected === 'Components') {
    for (const family of dna.componentFamilies) {
      const c = card(
        family.componentFamily,
        `${family.instances} instances · ${family.dimensions.typicalWidth} × ${family.dimensions.typicalHeight}px`,
      );
      c.append(
        el(
          'p',
          `Title: ${family.structure.hasTitle} · Description: ${family.structure.hasDescription} · Action: ${family.structure.hasAction} · Media: ${family.structure.media || 'none'} · ${family.group.layout}`,
        ),
      );
      for (const [name, ref] of Object.entries(family.visualStyle))
        c.append(el('code', `${name}: ${ref.token || 'local value'} = ${ref.resolved}`));
      evidence(c, family);
      grid.append(c);
    }
  } else if (selected === 'Layout') {
    panel.append(el('p', dna.responsive.limitation, 'notice'));
    for (const region of dna.layout.regions) {
      const c = card(
        region.type,
        `${region.width} × ${region.height}px · ${region.columns || 'flow'} columns · ${region.alignment}`,
      );
      evidence(c, region);
      grid.append(c);
    }
    findings({
      desktopContainer: dna.responsive.desktopContainer,
      mobileContainer: dna.responsive.mobileContainer,
      ...dna.responsive.typography,
    });
    for (const change of dna.responsive.layoutChanges) {
      const c = card('Observed responsive change', describe(change));
      evidence(c, change);
      grid.append(c);
    }
  } else if (selected === 'Motion') {
    panel.append(el('p', dna.motion.limitation, 'notice'));
    findings(dna.tokens.motion);
    for (const pattern of dna.motion.patterns) {
      const c = card(
        pattern.type,
        `${pattern.instances} instances · ${pattern.duration || 'duration unknown'} · ${pattern.easing || ''}`,
      );
      evidence(c, pattern);
      grid.append(c);
    }
  }
  if (!grid.children.length)
    grid.append(el('p', 'Nenhum padrão relevante detectado nesta amostra.', 'empty'));
  panel.append(grid);
}
