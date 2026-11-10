// The only place SVG markup is built (SPEC-svg-render.md "Output safety" and "Determinism").
//
// - Elements and attributes come from fixed allow-lists; a builder cannot emit anything else.
// - Attributes are written in the fixed per-element order of ALLOWED_ATTRIBUTES, never in the
//   caller's key order; `undefined` is never written.
// - Numbers go through `fmt`, colours are `#rrggbb` lower-cased (else INK), the font family is
//   sanitised, every other string attribute must match a strict pattern (otherwise the call
//   throws: that is a bug in the caller, never user data).
// - User text reaches the output only as the escaped content of `<text>` or `<metadata>`.
import { fmt } from './fmt';
import { INK, sanitizeFontFamily, STYLE_PRESETS } from './style';

export const SVG_NS = 'http://www.w3.org/2000/svg';

type Paint =
  | 'fill'
  | 'fill-opacity'
  | 'stroke'
  | 'stroke-width'
  | 'stroke-linecap'
  | 'stroke-linejoin'
  | 'stroke-dasharray';

const PAINT = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
] as const satisfies readonly Paint[];

/** Allowed attributes per element, in the order they are written. */
export const ALLOWED_ATTRIBUTES = {
  svg: ['xmlns', 'width', 'height', 'viewBox'],
  g: ['transform', ...PAINT],
  path: ['d', ...PAINT],
  polygon: ['points', ...PAINT],
  circle: ['cx', 'cy', 'r', ...PAINT],
  ellipse: ['cx', 'cy', 'rx', 'ry', ...PAINT],
  rect: ['x', 'y', 'width', 'height', ...PAINT],
  text: [
    'x',
    'y',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'fill',
    'stroke',
    'xml:space',
  ],
  metadata: ['id'],
} as const;

export type ElementName = keyof typeof ALLOWED_ATTRIBUTES;
export const ALLOWED_ELEMENTS: readonly ElementName[] = Object.keys(
  ALLOWED_ATTRIBUTES,
) as ElementName[];

type AttrValue = string | number | undefined;
export type Attrs<E extends ElementName> = Partial<
  Record<(typeof ALLOWED_ATTRIBUTES)[E][number], AttrValue>
>;
/** Loosest attribute bag (any allowed attribute); the builders check it per element. */
export type SvgAttrs = Partial<Record<(typeof ALLOWED_ATTRIBUTES)[ElementName][number], AttrValue>>;

type LeafElement = 'path' | 'polygon' | 'circle' | 'ellipse' | 'rect';

// --- character cleaning and escaping ---------------------------------------------------------

function isXmlChar(cp: number): boolean {
  return (
    cp === 0x9 ||
    cp === 0xa ||
    cp === 0xd ||
    (cp >= 0x20 && cp <= 0xd7ff) ||
    (cp >= 0xe000 && cp <= 0xfffd) ||
    (cp >= 0x10000 && cp <= 0x10ffff)
  );
}

/**
 * Makes a string legal XML 1.0 character data: controls (except tab, newline, CR), U+FFFE,
 * U+FFFF and lone surrogates become U+FFFD; CRLF and CR become LF (a parser would do so anyway).
 */
export function cleanXmlText(s: string): string {
  let out = '';
  for (const ch of s.replace(/\r\n?/g, '\n')) {
    out += isXmlChar(ch.codePointAt(0) ?? 0xfffd) ? ch : '�';
  }
  return out;
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/** Text-node content: cleaned, with `& < > " '` escaped. Newlines are kept. */
export function escapeText(s: string): string {
  return cleanXmlText(s).replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** Attribute value: as {@link escapeText}, with tabs and newlines turned into spaces. */
export function escapeAttr(s: string): string {
  return escapeText(s).replace(/[\t\n]/g, ' ');
}

// --- value validation ------------------------------------------------------------------------

/** A valid `#rrggbb`, lower-cased; anything else is {@link INK}. */
export function safeColor(c: unknown): string {
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : INK;
}

/**
 * Font-family list reduced to `A-Za-z0-9`, space, `,`, `-`, `_`, at most 200 characters; empty
 * after that gives `fallback` (the preset family by default).
 */
export function safeFontFamily(
  family: unknown,
  fallback: string = STYLE_PRESETS.slides.fontFamily,
): string {
  return sanitizeFontFamily(family) ?? fallback;
}

const NUM = String.raw`-?\d+(?:\.\d+)?`;
const NUMERIC_ATTRS: ReadonlySet<string> = new Set([
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'width',
  'height',
  'stroke-width',
  'font-size',
  'fill-opacity',
]);
const PATTERNS: Readonly<Record<string, RegExp>> = {
  d: /^[MmLlHhVvQqCcSsAaZz0-9.,\s-]*$/,
  points: /^[0-9.,\s-]*$/,
  transform: new RegExp(`^(?:(?:translate|scale|rotate|matrix)\\([-0-9. ,]*\\) ?)+$`),
  viewBox: new RegExp(`^${NUM} ${NUM} ${NUM} ${NUM}$`),
  'stroke-dasharray': /^[0-9.,\s]*$/,
  'stroke-linecap': /^(?:butt|round|square)$/,
  'stroke-linejoin': /^(?:miter|round|bevel)$/,
  'font-weight': /^(?:normal|bold)$/,
  'font-style': /^(?:normal|italic)$/,
  'xml:space': /^preserve$/,
  xmlns: /^http:\/\/www\.w3\.org\/2000\/svg$/,
  id: /^[A-Za-z][A-Za-z0-9_-]*$/,
};
const PT_SIZE = new RegExp(`^${NUM}pt$`);

function attrValue(element: ElementName, name: string, value: string | number): string {
  const fail = (why: string): never => {
    throw new Error(`svg-write: attribute "${name}" on <${element}> ${why}`);
  };
  if (name === 'fill' || name === 'stroke') {
    return value === 'none' ? 'none' : safeColor(value);
  }
  if (name === 'font-family') return escapeAttr(safeFontFamily(value));
  if (NUMERIC_ATTRS.has(name)) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return fail('must be finite');
      // The root's size is in points; everything else is a bare user unit.
      return element === 'svg' ? `${fmt(value)}pt` : fmt(value);
    }
    if (element === 'svg' && PT_SIZE.test(value)) return value;
    return fail('must be a number');
  }
  const pattern = PATTERNS[name];
  if (!pattern || typeof value !== 'string' || !pattern.test(value))
    return fail('has an unsafe value');
  return escapeAttr(value);
}

function writeAttrs(element: ElementName, attrs: Readonly<Record<string, AttrValue>>): string {
  const allowed: readonly string[] = ALLOWED_ATTRIBUTES[element];
  for (const key of Object.keys(attrs)) {
    if (attrs[key] !== undefined && !allowed.includes(key)) {
      throw new Error(`svg-write: attribute "${key}" is not allowed on <${element}>`);
    }
  }
  let out = '';
  for (const name of allowed) {
    const value = attrs[name];
    if (value !== undefined) out += ` ${name}="${attrValue(element, name, value)}"`;
  }
  return out;
}

function assertElement(name: string, allowed: readonly string[]): void {
  if (!allowed.includes(name)) throw new Error(`svg-write: element <${name}> is not allowed`);
}

// --- builders --------------------------------------------------------------------------------

const LEAVES: readonly LeafElement[] = ['path', 'polygon', 'circle', 'ellipse', 'rect'];

/** A childless drawing element: `path`, `polygon`, `circle`, `ellipse` or `rect`. */
export function el<E extends LeafElement>(name: E, attrs: Attrs<E>): string {
  assertElement(name, LEAVES);
  return `<${name}${writeAttrs(name, attrs)}/>`;
}

/** `<text>` with `xml:space="preserve"`; the content is the only place user text may land. */
export function svgText(attrs: Attrs<'text'>, content: string): string {
  return `<text${writeAttrs('text', { ...attrs, 'xml:space': 'preserve' })}>${escapeText(content)}</text>`;
}

/** `<metadata id="chalkbond">` holding opaque escaped text. */
export function svgMetadata(content: string): string {
  return `<metadata${writeAttrs('metadata', { id: 'chalkbond' })}>${escapeText(content)}</metadata>`;
}

function container(name: 'g' | 'svg', attrs: string, children: readonly string[]): string {
  return `<${name}${attrs}>\n${children.map((c) => `${c}\n`).join('')}</${name}>`;
}

/** `<g>` with one child per line. */
export function svgGroup(attrs: Attrs<'g'>, children: readonly string[]): string {
  return container('g', writeAttrs('g', attrs), children);
}

/**
 * The `<svg>` root, with the namespace added and a trailing newline. `width` and `height` are
 * point sizes (a number, or a string like `10.5pt`).
 */
export function svgRoot(attrs: Attrs<'svg'>, children: readonly string[]): string {
  return `${container('svg', writeAttrs('svg', { ...attrs, xmlns: SVG_NS }), children)}\n`;
}
