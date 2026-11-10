// Test helper: an independent ink box computed from the SVG markup alone (SPEC-svg-render.md
// "Testing"). It shares no layout code with the renderer: path vertices, curves sampled at 64
// steps, polygon / circle / rect / ellipse geometry, stroke half-widths, and `<text>` boxes from
// the advance table (width = advances x font size, height = cap height above the baseline, plus
// the descent when the text has a descending glyph).
import type { Rect } from '../../doc-model';
import { ADVANCE_BOLD, ADVANCE_REGULAR } from '../font-metrics';
import { checkXml, type XmlElement } from './xml-check';

const CURVE_STEPS = 64;
const CAP_HEIGHT_EM = 0.716;
const DESCENT_EM = 0.212;
const DESCENDING = new Set('gjpqyQ,;()[]{}|');
const FALLBACK_ADVANCE = 556;

type Pt = [number, number];
interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const num = (el: XmlElement, name: string): number => {
  const raw = el.attrs[name];
  if (raw === undefined) throw new Error(`ink-scan: <${el.name}> has no ${name}`);
  return Number(raw);
};

function box(points: readonly Pt[], grow = 0): Box {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    minX: Math.min(...xs) - grow,
    minY: Math.min(...ys) - grow,
    maxX: Math.max(...xs) + grow,
    maxY: Math.max(...ys) + grow,
  };
}

function bezier(ctrl: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= CURVE_STEPS; i++) {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    if (ctrl.length === 3) {
      const [p0, p1, p2] = ctrl as [Pt, Pt, Pt];
      out.push([
        u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
        u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
      ]);
    } else {
      const [p0, p1, p2, p3] = ctrl as [Pt, Pt, Pt, Pt];
      out.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  }
  return out;
}

/** Points of a path made of `M`, `L`, `Q` and `C` commands. */
function pathPoints(d: string): Pt[] {
  const tokens = d.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g) ?? [];
  const out: Pt[] = [];
  let current: Pt | null = null;
  let i = 0;
  const read = (count: number): Pt[] => {
    const pts: Pt[] = [];
    for (let k = 0; k < count; k++) {
      pts.push([Number(tokens[i++]), Number(tokens[i++])]);
    }
    return pts;
  };
  let cmd = '';
  while (i < tokens.length) {
    const t = tokens[i] as string;
    if (/[A-Za-z]/.test(t)) {
      cmd = t;
      i++;
    }
    if (cmd === 'M' || cmd === 'L') {
      const [p] = read(1) as [Pt];
      out.push(p);
      current = p;
    } else if (cmd === 'Q' || cmd === 'C') {
      const pts = read(cmd === 'Q' ? 2 : 3);
      if (!current) throw new Error('ink-scan: curve without a start point');
      out.push(...bezier([current, ...pts]));
      current = pts[pts.length - 1] as Pt;
    } else {
      throw new Error(`ink-scan: unsupported path command "${cmd}"`);
    }
  }
  return out;
}

function textBox(el: XmlElement): Box {
  const size = num(el, 'font-size');
  const x = num(el, 'x');
  const y = num(el, 'y');
  const table = el.attrs['font-weight'] === 'bold' ? ADVANCE_BOLD : ADVANCE_REGULAR;
  let units = 0;
  let descends = false;
  for (const ch of el.text) {
    units += table[ch.codePointAt(0) ?? 0] ?? FALLBACK_ADVANCE;
    if (DESCENDING.has(ch)) descends = true;
  }
  return {
    minX: x,
    maxX: x + (units * size) / 1000,
    minY: y - CAP_HEIGHT_EM * size,
    maxY: y + (descends ? DESCENT_EM * size : 0),
  };
}

function elementBox(el: XmlElement): Box | null {
  const stroked = el.attrs['stroke'] !== undefined && el.attrs['stroke'] !== 'none';
  const hw = stroked ? num(el, 'stroke-width') / 2 : 0;
  switch (el.name) {
    case 'path':
      return box(pathPoints(el.attrs['d'] ?? ''), hw);
    case 'polygon': {
      const nums = (el.attrs['points'] ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      const pts: Pt[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2)
        pts.push([nums[i] as number, nums[i + 1] as number]);
      return box(pts, hw);
    }
    case 'circle': {
      const [cx, cy, r] = [num(el, 'cx'), num(el, 'cy'), num(el, 'r')];
      return box(
        [
          [cx - r, cy - r],
          [cx + r, cy + r],
        ],
        hw,
      );
    }
    case 'ellipse': {
      const [cx, cy, rx, ry] = [num(el, 'cx'), num(el, 'cy'), num(el, 'rx'), num(el, 'ry')];
      return box(
        [
          [cx - rx, cy - ry],
          [cx + rx, cy + ry],
        ],
        hw,
      );
    }
    case 'rect': {
      const [x, y, w, h] = [num(el, 'x'), num(el, 'y'), num(el, 'width'), num(el, 'height')];
      return box(
        [
          [x, y],
          [x + w, y + h],
        ],
        hw,
      );
    }
    case 'text':
      return textBox(el);
    case 'svg':
    case 'g':
    case 'metadata':
      return null;
    default:
      throw new Error(`ink-scan: unexpected element <${el.name}>`);
  }
}

/**
 * The ink box of a markup fragment (or a whole `<svg>`), in the fragment's own coordinates (group
 * transforms are not applied). `null` when nothing is drawn.
 */
export function inkScan(markup: string): Rect | null {
  const xml = markup.trimStart().startsWith('<svg') ? markup : `<g>\n${markup}\n</g>`;
  const boxes = checkXml(xml)
    .elements.map(elementBox)
    .filter((b): b is Box => b !== null);
  if (boxes.length === 0) return null;
  const minX = Math.min(...boxes.map((b) => b.minX));
  const minY = Math.min(...boxes.map((b) => b.minY));
  const maxX = Math.max(...boxes.map((b) => b.maxX));
  const maxY = Math.max(...boxes.map((b) => b.maxY));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
