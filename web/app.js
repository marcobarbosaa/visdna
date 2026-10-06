import { renderSemantic } from './semantic.js';
import { pt } from './i18n.js';
const $ = (s) => document.querySelector(s);
const stages = {
  queued: 'Queued',
  opening: 'Opening website',
  extracting: 'Extracting computed styles',
  scroll: 'Observing scroll',
  responsive: 'Checking mobile viewport',
  colors: 'Detecting colors',
  typography: 'Analyzing typography',
  components: 'Mapping components',
  motion: 'Analyzing motion',
  building: 'Building Visual DNA',
  complete: 'Complete',
  error: 'Analysis failed',
};
let current = null,
  selected = 'Overview',
  generation = 0;
function el(tag, text, className) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = tag === 'pre' ? text : pt(text);
  if (className) n.className = className;
  return n;
}
function card(title, value) {
  const c = el('article', undefined, 'card');
  c.append(el('h3', title));
  if (value !== undefined) c.append(el('code', value));
  return c;
}
async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Serviço indisponível.');
  return data;
}
function error(message) {
  $('#error').textContent = pt(message);
  $('#error').hidden = !message;
}
async function history() {
  try {
    const rows = await api('/api/analyses');
    $('#count').textContent = String(rows.length);
    $('#history').replaceChildren();
    if (!rows.length) {
      const n = el('div', undefined, 'empty');
      n.append(
        el('strong', 'Your next reference starts here.'),
        el('span', 'Analise uma URL pública para começar sua coleção visual.'),
      );
      $('#history').append(n);
    }
    for (const r of rows) {
      const n = el('button', undefined, 'history-card');
      n.append(
        el('small', new Date(r.createdAt).toLocaleString('pt-BR')),
        el('strong', r.domain),
        el('small', `${pt(stages[r.stage] || r.stage)} ↗`),
      );
      n.onclick = () => watch(r.id);
      $('#history').append(n);
    }
  } catch (e) {
    error(e.message);
  }
}
function progress(stage) {
  $('#stage').textContent = pt(stages[stage] || stage);
  const keys = Object.keys(stages).filter((k) => !['queued', 'complete', 'error'].includes(k));
  $('#steps').replaceChildren(
    ...keys.map((k) =>
      el(
        'li',
        stages[k],
        k === stage ? 'current' : keys.indexOf(k) < keys.indexOf(stage) ? 'done' : '',
      ),
    ),
  );
}
async function watch(id) {
  const token = ++generation;
  const started = Date.now();
  $('#result').hidden = true;
  $('#progress').hidden = false;
  $('#submit').disabled = true;
  error('');
  try {
    for (;;) {
      if (token !== generation) return;
      const r = await api(`/api/analyses/${id}`);
      progress(r.stage);
      $('#elapsed').textContent = `${Math.floor((Date.now() - started) / 1000)}s`;
      if (r.stage === 'error') throw Error(r.error);
      if (r.stage === 'complete') {
        current = r;
        selected = 'Overview';
        render();
        break;
      }
      await new Promise((r) => setTimeout(r, 650));
    }
  } catch (e) {
    error(e.message);
  } finally {
    if (token === generation) {
      $('#progress').hidden = true;
      $('#submit').disabled = false;
      await history();
    }
  }
}
$('#analyze').onsubmit = async (event) => {
  event.preventDefault();
  error('');
  $('#submit').disabled = true;
  try {
    const data = await api('/api/analyses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: $('#url').value.trim() }),
    });
    await watch(data.id);
  } catch (e) {
    error(e.message);
    $('#submit').disabled = false;
  }
};
$('#refresh').onclick = history;
const sections = [
  'Overview',
  'Colors',
  'Typography',
  'Spacing',
  'Radius',
  'Shadows',
  'Components',
  'Layout',
  'Motion',
  'Raw Visual DNA',
];
function render() {
  const r = current,
    d = r.dna;
  $('#result').hidden = false;
  $('#domain').textContent = r.domain;
  $('#meta').textContent =
    `${d.methodology.sampledElements} elementos · ${d.source.viewports.join(' / ')} px · versão ${d.schemaVersion}`;
  $('#download').href = `/api/analyses/${r.id}/dna`;
  $('#tabs').replaceChildren(
    ...sections.map((name) => {
      const b = el('button', name, name === selected ? 'active' : '');
      b.setAttribute('aria-pressed', String(name === selected));
      b.onclick = () => {
        selected = name;
        render();
      };
      return b;
    }),
  );
  const panel = $('#panel');
  panel.replaceChildren();
  const grid = el('div', undefined, 'grid');
  if (selected === 'Overview') {
    const wrap = el('div', undefined, 'overview');
    const picture = el('div');
    const img = el('img', undefined, 'screenshot');
    if (r.artifacts?.desktop) img.src = `/api/analyses/${r.id}/images/main.png`;
    img.alt = 'Captura desktop da página analisada';
    if (r.artifacts?.desktop) picture.append(img);
    else picture.append(el('p', 'Captura principal indisponível.', 'notice'));
    const links = el('p', undefined, 'chips');
    for (const [name, label] of [
      ['full', 'Full page'],
      ['mobile', 'Mobile'],
    ]) {
      if (!(name === 'full' ? r.artifacts?.fullPage : r.artifacts?.mobile)) continue;
      const a = el('a', label, 'chip');
      a.href = `/api/analyses/${r.id}/images/${name}.png`;
      a.target = '_blank';
      a.rel = 'noopener';
      links.append(a);
    }
    if (!r.artifacts?.fullPage && r.artifacts?.segments?.length) {
      const open = el('button', 'Página inteira', 'chip');
      const gallery = el('div', undefined, 'segments');
      gallery.hidden = true;
      open.setAttribute('aria-expanded', 'false');
      open.onclick = () => {
        gallery.hidden = !gallery.hidden;
        open.setAttribute('aria-expanded', String(!gallery.hidden));
        if (gallery.childElementCount) return;
        for (const segment of r.artifacts.segments) {
          const figure = el('figure');
          const image = el('img', undefined, 'screenshot');
          image.loading = 'lazy';
          image.src = `/api/analyses/${r.id}/images/${segment.file}`;
          image.alt = `Segmento ${segment.index + 1}: ${Math.round(segment.startY)} a ${Math.round(segment.endY)} pixels`;
          image.onerror = () => {
            image.remove();
            figure.append(el('p', 'Este segmento não está mais disponível.'));
          };
          figure.append(el('figcaption', image.alt), image);
          gallery.append(figure);
        }
      };
      links.append(open);
      picture.append(gallery);
    }
    img.onerror = () => {
      img.remove();
      picture.prepend(el('p', 'A captura não está mais disponível.'));
    };
    picture.append(links);
    const aside = card('Measured, then interpreted.');
    if (d.schemaVersion === '2.0') {
      if (d.identity.theme.value) aside.append(el('p', `Tema: ${pt(d.identity.theme.value)}.`));
      if (d.layout.desktopContainer.value)
        aside.append(el('p', `Container de conteúdo: ${d.layout.desktopContainer.value}px.`));
      const body = d.typography.roles.body?.value;
      if (body) aside.append(el('p', `Texto do corpo: ${body.family}, ${body.size}.`));
      aside.append(
        el(
          'p',
          `${d.componentFamilies.length} famílias de componentes e ${d.motion.patterns.length} padrões de movimento ou posicionamento.`,
        ),
      );
      const raw = el('a', 'Download RAW analysis', 'chip');
      raw.href = `/api/analyses/${r.id}/raw`;
      if (r.artifacts?.raw) aside.append(raw);
    }
    aside.append(
      el(
        'p',
        'As frequências contam propriedades da amostra, não a área ocupada por cada cor.',
        'muted',
      ),
    );
    const details = el('details', undefined, 'warnings');
    details.append(el('summary', `${d.methodology.warnings.length} avisos da análise`));
    const list = el('ul');
    for (const warning of d.methodology.warnings) {
      const category = /ERROR|erro/i.test(warning)
        ? 'Erro'
        : /WARNING|aviso/i.test(warning)
          ? 'Aviso'
          : /limit|parcial|unknown|heuristic|estimate|may|not /i.test(warning)
            ? 'Limitação'
            : 'Informação';
      const translated = pt(warning);
      list.append(
        el('li', translated.startsWith(`${category}:`) ? translated : `${category}: ${translated}`),
      );
    }
    details.append(list);
    aside.append(details);
    wrap.append(picture, aside);
    panel.append(wrap);
    const coverage = r.captureCoverage;
    if (coverage) {
      const percent = (n) => `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
      const section = el('section', undefined, 'coverage');
      section.append(el('h3', 'Cobertura da análise'));
      const grid = el('div', undefined, 'grid');
      const visual = coverage.screenshots.coverage * coverage.screenshots.horizontalCoverage;
      for (const [label, value] of [
        ['DOM', coverage.dom.truncated ? 'Amostra limitada' : 'Amostra sem truncamento'],
        [
          'Elementos analisados',
          `${coverage.dom.sampledElements} (${coverage.dom.addedElements} adicionais durante a rolagem)`,
        ],
        [
          'Scroll observado',
          `${percent(coverage.scroll.coverage)} · ${coverage.scroll.reachedBottom ? 'fim alcançado' : 'fim não alcançado'}`,
        ],
        [visual >= 1 ? 'Captura visual' : 'Captura visual parcial', percent(visual)],
        ['Computador', `1440 × 900 · página ${coverage.pageWidth} × ${coverage.pageHeight}px`],
        ['Celular', `390 × 844 · rolagem observada ${percent(coverage.mobile.coverage)}`],
        ['Canvas encontrados', coverage.motion.canvasRegions],
        ['Checkpoints de movimento', coverage.motion.checkpoints],
      ])
        grid.append(card(label, value));
      section.append(
        grid,
        el(
          'p',
          'DOM indica a amostragem dos elementos renderizados. As porcentagens de rolagem e captura visual medem as faixas realmente observadas; chegar ao fim não garante ausência de lacunas.',
          'notice',
        ),
      );
      panel.append(section);
    } else
      panel.append(el('p', 'Este registro antigo não possui métricas de cobertura.', 'notice'));
    return;
  }
  if (selected === 'Raw Visual DNA') {
    panel.append(el('pre', JSON.stringify(d, null, 2)));
    return;
  }
  if (d.schemaVersion === '2.0') {
    renderSemantic(panel, selected, d, { el, card });
    return;
  }
  if (selected === 'Colors') {
    panel.append(
      el(
        'p',
        'Papéis sem evidência suficiente permanecem desconhecidos. Transparências são preservadas.',
        'notice',
      ),
    );
    for (const t of d.colors.palette) {
      const c = card(t.value, `${t.count} occurrences / ${t.frequency}%`),
        s = el('div', undefined, 'swatch');
      s.style.backgroundColor = t.value;
      c.prepend(s);
      const roles = Object.entries(d.colors.roles)
        .filter(([, v]) => v.value === t.value)
        .map(([k, v]) => `${k} (${Math.round(v.confidence * 100)}%)`);
      c.append(el('small', roles.join(' · ') || 'Unclassified'));
      grid.append(c);
    }
  }
  if (selected === 'Typography')
    for (const t of d.typography.scale) {
      const c = card(t.role, `${t.size} / ${t.weight} / ${t.lineHeight}`);
      const sample = el('div', undefined, 'sample'),
        p = el('p', 'The art of seeing.');
      p.style.fontSize = t.size;
      p.style.fontWeight = t.weight;
      p.style.letterSpacing = t.tracking;
      p.style.fontFamily = t.family;
      sample.append(p);
      c.append(
        sample,
        el('code', t.family),
        el('small', 'Font family declarada; fonte original não baixada.'),
      );
      grid.append(c);
    }
  if (['Spacing', 'Radius', 'Shadows'].includes(selected)) {
    const key = { Spacing: 'spacing', Radius: 'radius', Shadows: 'shadows' }[selected];
    for (const t of d[key]) {
      const c = card(t.value, `${t.count} occurrences / ${t.frequency}%`),
        sample = el('div', undefined, selected === 'Spacing' ? 'space-bar' : 'radius-box');
      if (selected === 'Spacing') sample.style.width = `${Math.min(parseFloat(t.value), 220)}px`;
      if (selected === 'Radius') sample.style.borderRadius = t.value;
      if (selected === 'Shadows') sample.style.boxShadow = t.value;
      c.append(sample);
      grid.append(c);
    }
  }
  if (selected === 'Components') {
    panel.append(
      el(
        'p',
        'Detecção heurística com evidências. As amostras não reproduzem textos ou ativos da página.',
        'notice',
      ),
    );
    for (const t of d.components) {
      const c = card(t.type, `${t.elementId} · confidence ${Math.round(t.confidence * 100)}%`),
        preview = el('div', 'Aa — Visual sample', 'sample');
      for (const k of [
        'backgroundColor',
        'color',
        'border',
        'borderRadius',
        'padding',
        'fontSize',
        'fontWeight',
        'boxShadow',
      ])
        preview.style[k] = t.styles[k];
      preview.style.maxHeight = '140px';
      c.append(
        preview,
        el('code', t.evidence.join(' / ')),
        el('code', `Padding ${t.styles.padding} · ${t.styles.display}`),
      );
      grid.append(c);
    }
  }
  if (selected === 'Layout') {
    panel.append(
      el(
        'p',
        `${d.responsive.changes.length} alterações amostradas entre desktop e mobile. Os padrões de layout são candidatos, não classificações definitivas.`,
        'notice',
      ),
    );
    for (const t of d.layout) {
      const c = card(t.pattern, t.elementId);
      c.append(
        el('code', `${t.display} · ${t.width}px`),
        el('code', `Columns: ${t.columns}`),
        el('code', `Gap: ${t.gap} · ${t.alignment}`),
      );
      grid.append(c);
    }
    const c = card('Container widths');
    for (const t of d.containers.slice(0, 8)) c.append(el('code', `${t.value} · ${t.count}×`));
    grid.append(c);
  }
  if (selected === 'Motion') {
    panel.append(
      el(
        'p',
        'Cinco posições de scroll são observadas. Mudanças podem ser causadas pelo tempo, e não pelo scroll. Hover não é acionado.',
        'notice',
      ),
    );
    for (const t of d.motion) {
      const c = card(t.patterns.join(' · ') || 'CSS motion declaration', t.elementId);
      c.append(
        el('code', t.transition),
        el('code', t.animation),
        el('small', `Confidence ${Math.round(t.confidence * 100)}%`),
      );
      grid.append(c);
    }
  }
  if (!grid.children.length)
    grid.append(el('p', 'Nenhum padrão relevante detectado nesta amostra.', 'empty'));
  panel.append(grid);
}
history();
