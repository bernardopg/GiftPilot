/*
  Generates css/site/dark.css from SteamGifts' own stylesheet.

  Every rule of the site CSS that sets a color is mirrored with its colors
  remapped to a dark palette (lightness inverted, hue kept, neutrals tinted
  blue) and its selectors prefixed with `:root` so the mirrored rule always
  outranks the original one regardless of stylesheet order. Hand-tuned rules
  from css/site/dark.overrides.css are appended afterwards.

  Usage: node scripts/build-site-dark.mjs [path/to/site.css]
  (default: tests/fixtures/steamgifts/site.css — refresh it from the live site
  when SteamGifts ships a new stylesheet).
*/
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const sourcePath = path.resolve(
  rootDir,
  process.argv[2] || 'tests/fixtures/steamgifts/site.css',
);
const overridesPath = path.join(rootDir, 'css/site/dark.overrides.css');
const outputPath = path.join(rootDir, 'css/site/dark.css');

const COLOR_PROPS =
  /^(background(-color|-image)?|color|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|box-shadow|text-shadow|fill|stroke|caret-color|text-decoration-color|column-rule-color)$/;
const COLOR_TOKEN =
  /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|rgba?\([^)]*\)|\b(white|black)\b/g;

const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));

const parseColor = (token) => {
  const lower = token.toLowerCase();
  if (lower === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (lower === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  if (lower.startsWith('#')) {
    let hex = lower.slice(1);
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('');
    const n = (i) => parseInt(hex.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 };
  }
  const parts = lower
    .replace(/rgba?\(|\)/g, '')
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length < 3 || parts.some((p) => Number.isNaN(p))) return null;
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
};

const rgbToHsl = ({ r, g, b }) => {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
};

const hslToRgb = ({ h, s, l }) => {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return {
    r: Math.round(f(0) * 255),
    g: Math.round(f(8) * 255),
    b: Math.round(f(4) * 255),
  };
};

const format = ({ r, g, b }, a) => {
  if (a >= 1) {
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${+a.toFixed(3)})`;
};

/** Maps one light-theme color to its dark-theme counterpart. */
export const darken = (token, prop) => {
  const color = parseColor(token);
  if (!color) return token;
  const hsl = rgbToHsl(color);
  // Translucent dark overlays are shadows: keep them as they are.
  if (color.a < 1 && hsl.l < 0.2) return token;

  const isText = prop === 'color' || prop === 'fill' || prop === 'caret-color';
  // Already-dark surfaces (header, footer, featured banner) and light text
  // drawn on them are left alone; inverting them would make them light.
  if (!isText && !/shadow/.test(prop) && hsl.l < 0.4) return token;
  if (isText && hsl.l > 0.78) return token;

  const neutral = hsl.s < 0.12;
  let l = 0.075 + (1 - hsl.l) * 0.84;
  let s = neutral ? 0.16 : hsl.s * 0.82;
  const h = neutral ? 220 : hsl.h;

  if (isText) {
    l = clamp(l, neutral ? 0.6 : 0.64, 0.94);
    if (!neutral) s = Math.min(1, hsl.s);
  } else if (/shadow/.test(prop)) {
    l = Math.min(l, 0.18);
  } else if (/^background/.test(prop)) {
    l = Math.min(l, neutral ? 0.3 : 0.36);
  } else if (/border|outline/.test(prop)) {
    l = clamp(l, 0.2, 0.42);
  }
  return format(hslToRgb({ h, s, l }), color.a);
};

const prefixSelector = (selector) =>
  selector
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (/^html\b/.test(part)) return part.replace(/^html/, ':root');
      if (/^:root\b/.test(part)) return part;
      return `:root ${part}`;
    })
    .join(',\n');

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Minimal CSS splitter supporting nested @media / @supports blocks. */
const splitBlocks = (css) => {
  const blocks = [];
  let depth = 0;
  let start = 0;
  let head = '';
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      if (depth === 0) {
        head = css.slice(start, i).trim();
        start = i + 1;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        blocks.push({ head, body: css.slice(start, i) });
        start = i + 1;
      }
    }
  }
  return blocks;
};

const transformDeclarations = (body) => {
  const out = [];
  for (const declaration of body.split(';')) {
    const index = declaration.indexOf(':');
    if (index === -1) continue;
    const prop = declaration.slice(0, index).trim().toLowerCase();
    const value = declaration.slice(index + 1).trim();
    if (!COLOR_PROPS.test(prop) || !value.match(COLOR_TOKEN)) continue;
    // Keep images, drop everything but colors from background shorthands.
    const mapped = value.replace(COLOR_TOKEN, (token) => darken(token, prop));
    if (mapped !== value) out.push(`  ${prop}: ${mapped};`);
  }
  return out;
};

const transform = (css) => {
  const out = [];
  for (const { head, body } of splitBlocks(stripComments(css))) {
    if (
      /^@(font-face|keyframes|-webkit-keyframes|import|charset)/i.test(head)
    ) {
      continue;
    }
    if (/^@(media|supports)/i.test(head)) {
      const inner = transform(body);
      if (inner.trim()) out.push(`${head} {\n${inner}\n}`);
      continue;
    }
    const declarations = transformDeclarations(body);
    if (declarations.length) {
      out.push(`${prefixSelector(head)} {\n${declarations.join('\n')}\n}`);
    }
  }
  return out.join('\n\n');
};

if (
  process.argv[1] &&
  import.meta.url.endsWith(path.basename(process.argv[1]))
) {
  const source = fs.readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, '');
  const overrides = fs.existsSync(overridesPath)
    ? fs.readFileSync(overridesPath, 'utf8')
    : '';
  const banner = `/*\n  GENERATED by scripts/build-site-dark.mjs from ${path.relative(
    rootDir,
    sourcePath,
  )}.\n  Do not edit by hand: change the generator or css/site/dark.overrides.css.\n*/\n\n`;
  fs.writeFileSync(
    outputPath,
    `${banner}${transform(source)}\n\n/* ---- overrides ---- */\n\n${overrides}`,
  );
  console.log(`Wrote ${path.relative(rootDir, outputPath)}`);
}
