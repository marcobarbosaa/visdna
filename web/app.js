import { renderSemantic } from './semantic.js';
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
  if (text !== undefined) n.textContent = text;
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
  $('#error').textContent = message;
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
        el('small', `${stages[r.stage] || r.stage} ↗`),
      );
      n.onclick = () => watch(r.id);
      $('#history').append(n);
    }
  } catch (e) {
    error(e.message);
  }
}
function progress(stage) {
  $('#stage').textContent = stages[stage] || stage;
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
    `${d.methodology.sampledElements} elements · ${d.source.viewports.join(' / ')} px · schema ${d.schemaVersion}`;
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
    img.src = `/api/analyses/${r.id}/images/main.png`;
    img.alt = 'Captura desktop da página analisada';
    picture.append(img);
    const links = el('p', undefined, 'chips');
    for (const [name, label] of [
      ['full', 'Full page'],
      ['mobile', 'Mobile'],
    ]) {
      const a = el('a', label, 'chip');
      a.href = `/api/analyses/${r.id}/images/${name}.png`;
      a.target = '_blank';
      a.rel = 'noopener';
      links.append(a);
    }
    picture.append(links);
    const aside = card('Measured, then interpreted.');
    if (d.schemaVersion === '2.0') {
      for (const summary of Object.values(d.designSummary)) aside.append(el('p', summary));
      const raw = el('a', 'Download RAW analysis', 'chip');
      raw.href = `/api/analyses/${r.id}/raw`;
      aside.append(raw);
    }
    aside.append(
      el(
        'p',
        'As frequências contam propriedades da amostra, não a área ocupada por cada cor.',
        'muted',
      ),
    );
    const list = el('ul');
    for (const warning of d.methodology.warnings) list.append(el('li', warning));
    aside.append(list);
    wrap.append(picture, aside);
    panel.append(wrap);
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
