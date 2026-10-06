import type { Capture, ElementSample } from '../src/types.js';
export function element(
  id: string,
  tag: string,
  parent: string | null,
  x: number,
  y: number,
  width: number,
  height: number,
  styles: Record<string, string> = {},
  children = 0,
  textLength = 0,
): ElementSample {
  return {
    id,
    tag,
    parent,
    role: '',
    children,
    textLength,
    rect: { x, y, width, height },
    styles: {
      display: 'block',
      fontSize: '16px',
      fontWeight: '400',
      fontFamily: 'Arial, sans-serif',
      lineHeight: '24px',
      letterSpacing: '0px',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      color: '#eeeeee',
      borderWidth: '0px',
      borderRadius: '0px',
      boxShadow: 'none',
      ...styles,
    },
  };
}
export function semanticFixture(): Capture {
  const elements = [
    element('e0', 'body', null, 0, 0, 1440, 1800, { backgroundColor: '#222326' }, 5),
    element('e1', 'nav', 'e0', 0, 0, 1440, 80, { display: 'flex' }, 1),
    element(
      'e2',
      'button',
      'e1',
      20,
      20,
      100,
      40,
      { backgroundColor: '#be0505', padding: '8px', paddingTop: '8px' },
      0,
      10,
    ),
    element(
      'e3',
      'header',
      'e0',
      120,
      100,
      1200,
      500,
      { display: 'flex', maxWidth: '1200px', paddingTop: '40px', paddingBottom: '40px' },
      2,
    ),
    element('e4', 'div', 'e3', 120, 140, 560, 360, {}, 3),
    element(
      'e5',
      'h1',
      'e4',
      120,
      150,
      500,
      80,
      { fontSize: '56px', fontWeight: '700', lineHeight: '60px' },
      0,
      40,
    ),
    element('e6', 'p', 'e4', 120, 260, 500, 70, {}, 0, 80),
    element(
      'e7',
      'button',
      'e4',
      120,
      360,
      180,
      48,
      {
        backgroundColor: '#2366ee',
        padding: '16px',
        paddingTop: '16px',
        paddingBottom: '16px',
        borderRadius: '8px',
        transitionProperty: 'color',
        transitionDuration: '0.2s',
        transitionTimingFunction: 'ease',
      },
      0,
      12,
    ),
    element('e8', 'img', 'e3', 760, 140, 560, 360),
    element(
      'e9',
      'section',
      'e0',
      120,
      680,
      1200,
      320,
      {
        display: 'grid',
        maxWidth: '1200px',
        gridTemplateColumns: '384px 384px 384px',
        columnGap: '24px',
        rowGap: '24px',
        paddingTop: '40px',
        paddingBottom: '40px',
      },
      3,
    ),
  ];
  for (let i = 0; i < 3; i++) {
    const id = 10 + i * 4,
      x = 120 + i * 408;
    elements.push(
      element(
        `e${id}`,
        'article',
        'e9',
        x,
        700,
        384,
        280,
        {
          backgroundColor: i === 1 ? '#25262a' : '#272728',
          borderRadius: '16px',
          padding: '16px',
          paddingTop: '16px',
          paddingBottom: '16px',
          paddingLeft: '16px',
          paddingRight: '16px',
          boxShadow: '0px 4px 16px #00000033',
        },
        3,
      ),
    );
    elements.push(
      element(
        `e${id + 1}`,
        'h2',
        `e${id}`,
        x + 16,
        720,
        350,
        40,
        { fontSize: '28px', fontWeight: '600', color: '#cbb46c' },
        0,
        15,
      ),
    );
    elements.push(element(`e${id + 2}`, 'p', `e${id}`, x + 16, 780, 350, 70, {}, 0, 60));
    elements.push(
      element(
        `e${id + 3}`,
        'button',
        `e${id}`,
        x + 16,
        900,
        180,
        48,
        {
          backgroundColor: '#2366ee',
          padding: '16px',
          paddingTop: '16px',
          paddingBottom: '16px',
          borderRadius: '8px',
          transitionProperty: 'color',
          transitionDuration: '200ms',
          transitionTimingFunction: 'ease',
        },
        0,
        12,
      ),
    );
  }
  elements.push(
    element(
      'e30',
      'footer',
      'e0',
      0,
      1500,
      1440,
      300,
      { paddingTop: '40px', paddingBottom: '40px' },
      0,
      60,
    ),
  );
  const mobile = elements.map((e) => ({
    ...e,
    rect: { ...e.rect, x: 16, width: 358, y: e.id === 'e9' ? 900 : e.rect.y },
    styles: {
      ...e.styles,
      ...(e.tag === 'h1' ? { fontSize: '36px' } : {}),
      ...(e.id === 'e3' ? { flexDirection: 'column' } : {}),
      ...(e.id === 'e9' ? { gridTemplateColumns: '358px' } : {}),
    },
  }));
  for (let i = 0; i < 3; i++) {
    const card = mobile.find((e) => e.id === `e${10 + i * 4}`)!;
    card.rect.y = 940 + i * 300;
  }
  return {
    desktop: { width: 1440, height: 900, pageHeight: 1800, elements, truncated: false },
    mobile: { width: 390, height: 844, pageHeight: 2200, elements: mobile, truncated: false },
    frames: [],
    warnings: [],
    finalUrl: 'https://fixture.example/',
  };
}
