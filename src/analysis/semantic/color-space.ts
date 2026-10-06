// Conversion matrices and transfer functions: W3C CSS Color 4, section 19.
// Comparison uses unclipped OKLab; hexadecimal previews are clipped to sRGB.
type Vec = [number, number, number];
export interface ParsedColor {
  value: string;
  lab: Vec;
  alpha: number;
  luminance: number;
  chroma: number;
}
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const linear = (v: number) =>
  Math.abs(v) <= 0.04045 ? v / 12.92 : Math.sign(v) * ((Math.abs(v) + 0.055) / 1.055) ** 2.4;
const gamma = (v: number) =>
  Math.abs(v) <= 0.0031308 ? 12.92 * v : Math.sign(v) * (1.055 * Math.abs(v) ** (1 / 2.4) - 0.055);
const mat = (m: number[][], v: Vec): Vec =>
  m.map((r) => r.reduce((sum, n, i) => sum + n * v[i]!, 0)) as Vec;
const xyzToRGB = (v: Vec) =>
  mat(
    [
      [3.24096994, -1.53738318, -0.49861076],
      [-0.96924364, 1.8759675, 0.04155506],
      [0.05563008, -0.20397696, 1.05697151],
    ],
    v,
  );
const d50To65 = (v: Vec) =>
  mat(
    [
      [0.9554734, -0.0230985, 0.0632593],
      [-0.0283697, 1.0099955, 0.0210414],
      [0.012314, -0.0205077, 1.3303659],
    ],
    v,
  );
function toLab(rgb: Vec): Vec {
  const lms = mat(
    [
      [0.4122214708, 0.5363325363, 0.0514459929],
      [0.2119034982, 0.6806995451, 0.1073969566],
      [0.0883024619, 0.2817188376, 0.6299787005],
    ],
    rgb,
  ).map(Math.cbrt) as Vec;
  return mat(
    [
      [0.2104542553, 0.793617785, -0.0040720468],
      [1.9779984951, -2.428592205, 0.4505937099],
      [0.0259040371, 0.7827717662, -0.808675766],
    ],
    lms,
  );
}
function fromLab(lab: Vec): Vec {
  const lms = mat(
    [
      [1, 0.3963377774, 0.2158037573],
      [1, -0.1055613458, -0.0638541728],
      [1, -0.0894841775, -1.291485548],
    ],
    lab,
  ).map((v) => v ** 3) as Vec;
  return mat(
    [
      [4.0767416621, -3.3077115913, 0.2309699292],
      [-1.2684380046, 2.6097574011, -0.3413193965],
      [-0.0041960863, -0.7034186147, 1.707614701],
    ],
    lms,
  );
}
const number = (s: string, scale = 1) =>
  /^[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?%?$/i.test(s)
    ? parseFloat(s) * (s.endsWith('%') ? scale / 100 : 1)
    : NaN;
function angle(s: string) {
  const match = s.match(/^([-+]?(?:\d*\.)?\d+)(deg|rad|grad|turn)?$/);
  if (!match) return NaN;
  return (
    Number(match[1]) *
    ({ deg: 1, rad: 180 / Math.PI, grad: 0.9, turn: 360 }[match[2] || 'deg'] || 1)
  );
}
export function parseColor(input: string): ParsedColor | null {
  const v = input.trim().toLowerCase();
  let rgb: Vec;
  let alpha = 1;
  const hex = v.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/);
  if (hex) {
    let h = hex[1]!;
    if (h.length < 5) h = [...h].map((c) => c + c).join('');
    rgb = [0, 2, 4].map((i) => linear(parseInt(h.slice(i, i + 2), 16) / 255)) as Vec;
    alpha = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1;
  } else {
    const match = v.match(/^(rgb|rgba|hsl|hsla|oklab|oklch|lab|lch|color)\(([^()]+)\)$/);
    if (!match) return null;
    const fn = match[1]!,
      parts = match[2]!.trim().replace(/,/g, ' ').replace(/\//g, ' / ').split(/\s+/);
    const slash = parts.indexOf('/');
    if (slash >= 0) {
      if (slash !== parts.length - 2) return null;
      alpha = number(parts[slash + 1]!);
      parts.splice(slash);
    } else if (parts.length === 4 && fn !== 'color') alpha = number(parts.pop()!);
    const space = fn === 'color' ? parts.shift() : '';
    if (parts.length !== 3 || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;
    const [a, b, c] = parts as [string, string, string];
    if (fn === 'rgb' || fn === 'rgba') {
      const values = parts.map((s) => number(s, 255));
      if (values.some((n) => n < 0 || n > 255)) return null;
      rgb = values.map((n) => linear(n / 255)) as Vec;
    } else if (fn === 'hsl' || fn === 'hsla') {
      const h = ((angle(a) % 360) + 360) % 360,
        s = number(b, 1),
        l = number(c, 1);
      if (!b.endsWith('%') || !c.endsWith('%') || s < 0 || s > 1 || l < 0 || l > 1) return null;
      const chroma = (1 - Math.abs(2 * l - 1)) * s,
        x = chroma * (1 - Math.abs(((h / 60) % 2) - 1)),
        m = l - chroma / 2;
      const hues: Vec[] = [
        [chroma, x, 0],
        [x, chroma, 0],
        [0, chroma, x],
        [0, x, chroma],
        [x, 0, chroma],
        [chroma, 0, x],
      ];
      const hue = hues[Math.floor(h / 60)];
      if (!hue) return null;
      rgb = hue.map((n) => linear(n + m)) as Vec;
    } else if (fn === 'oklab' || fn === 'oklch' || fn === 'lab' || fn === 'lch') {
      const ok = fn.startsWith('ok'),
        polar = fn.endsWith('lch');
      const light = number(a, ok ? 1 : 100),
        second = number(b, ok ? 0.4 : polar ? 150 : 125);
      const third = polar ? (angle(c) * Math.PI) / 180 : number(c, ok ? 0.4 : 125);
      const lab: Vec = [
        light,
        polar ? second * Math.cos(third) : second,
        polar ? second * Math.sin(third) : third,
      ];
      if (ok) rgb = fromLab(lab);
      else {
        const f1 = (lab[0] + 16) / 116,
          f0 = lab[1] / 500 + f1,
          f2 = f1 - lab[2] / 200;
        const inverse = (t: number) =>
          t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27);
        rgb = xyzToRGB(
          d50To65([inverse(f0) * 0.9642956764, inverse(f1), inverse(f2) * 0.8251046025]),
        );
      }
    } else if (fn === 'color') {
      const values = parts.map((s) => number(s)) as Vec;
      if (space === 'srgb') rgb = values.map(linear) as Vec;
      else if (space === 'srgb-linear') rgb = values;
      else if (space === 'display-p3')
        rgb = xyzToRGB(
          mat(
            [
              [0.4865709486, 0.2656676932, 0.1982172852],
              [0.2289745641, 0.6917385218, 0.0792869141],
              [0, 0.0451133819, 1.0439443689],
            ],
            values.map(linear) as Vec,
          ),
        );
      else if (space === 'xyz' || space === 'xyz-d65') rgb = xyzToRGB(values);
      else if (space === 'xyz-d50') rgb = xyzToRGB(d50To65(values));
      else return null;
    } else return null;
  }
  if (alpha <= 0 || rgb.some((n) => !Number.isFinite(n))) return null;
  const lab = toLab(rgb);
  const byte = (n: number) =>
    Math.round(clamp(n) * 255)
      .toString(16)
      .padStart(2, '0');
  const clipped = rgb.some((n) => n < -0.00001 || n > 1.00001);
  // Retain wide-gamut source instead of making distinct colors identical after clipping.
  const value = clipped
    ? v
    : '#' + rgb.map((n) => byte(gamma(n))).join('') + (alpha < 1 ? byte(alpha) : '');
  return {
    value,
    lab,
    alpha,
    luminance: clamp(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]),
    chroma: Math.hypot(lab[1], lab[2]),
  };
}
export const colorDistance = (a: ParsedColor, b: ParsedColor) =>
  Math.hypot(...a.lab.map((v, i) => v - b.lab[i]!));
export const contrast = (a: ParsedColor, b: ParsedColor) =>
  (Math.max(a.luminance, b.luminance) + 0.05) / (Math.min(a.luminance, b.luminance) + 0.05);
