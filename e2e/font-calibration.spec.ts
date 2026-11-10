// SPEC-svg-render.md "Text measurement": proves the committed Arial advance-width table and the
// ink boxes the renderer uses against real text rendering in the app's Chromium (real Arial on
// Windows). Width: getComputedTextLength() of an SVG <text> at font-size 100 must agree with
// measureRuns within 1 % (and 20 px). Boxes: every rendered glyph's ink (canvas
// actualBoundingBox*) and the SVG bounding box must lie inside the box the renderer computes.
import { expect, test } from '@playwright/test';
import { resolveStyle } from '../src/core/svg-render/style';
import { OVERHANG_EM, measureRuns } from '../src/core/svg-render/text-measure';
import { launchApp } from './launch';

const FONT_SIZE = 100;
/**
 * Glyph boxes are checked on rasterised pixels at this size: the browser's reported ink bounds
 * (canvas actualBoundingBox*, SVG getBBox) are quantised to 1/64 em or whole pixels, which is
 * coarser than the margins being checked.
 */
const BOX_FONT_SIZE = 200;
const FAMILY = 'Arial, Helvetica, sans-serif';
const REL_TOLERANCE = 0.01;
const ABS_TOLERANCE = 20;
/** One pixel: a pixel with any coverage counts as ink, so the scanned bounds are outward-rounded. */
const EPS = 1;

interface Sample {
  text: string;
  bold: boolean;
  italic: boolean;
}

const range = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i));

const WORDS = [
  'Hello World',
  'The quick brown fox jumps over the lazy dog',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'abcdefghijklmnopqrstuvwxyz',
  '0123456789',
  'CH3CH2OH',
  'CO2H',
  'NaOH + HCl',
  'H2SO4',
  'Ph-NO2',
  'OMe',
  'iPr tBu',
  '1,2-dimethylcyclohexane',
  '(R)-2-butanol [Cu(NH3)4]2+',
  '2−',
  'δ+ δ− δδ+',
  'Δ α β γ μ π ν λ σ ω',
  'ΔH = −286 kJ mol−1',
  '– — ‘x’ “x” † ‡ • …',
  '← → ↑ ↓ ↔ ↕',
  'é ü ñ ° ± × ÷ ·',
  'j g y p q Q f',
];

// Every character the table covers on its own, plus whole strings, regular and bold.
const SINGLES = [
  ...range(0x20, 0x7e),
  ...range(0xa0, 0xff),
  ...range(0x391, 0x3c9).filter((c) => !['΢', 'Ϊ', 'Ϋ'].includes(c)),
  ...['–', '—', '‘', '’', '“', '”', '†', '‡', '•'],
  ...['…', '←', '↑', '→', '↓', '↔', '↕', '−'],
];

const samples: Sample[] = [];
for (const bold of [false, true]) {
  for (const text of [...WORDS, ...SINGLES]) samples.push({ text, bold, italic: false });
}
samples.push({ text: 'Hello World δ−', bold: false, italic: true });
samples.push({ text: 'Hello World δ−', bold: true, italic: true });

const style = resolveStyle({
  preset: 'slides',
  overrides: { fontSize: FONT_SIZE, fontFamily: FAMILY },
});

interface Measured {
  length: number;
}
interface Ink {
  /** Rasterised ink bounds relative to the text origin (left edge x = 0, baseline y = 0). */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

test('Arial width table and text ink boxes agree with real rendering', async () => {
  const app = await launchApp();
  try {
    const page = await app.firstWindow();
    const lengths = await page.evaluate(
      ({ items, size, family }) => {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        document.body.appendChild(svg);
        const out = items.map((it) => {
          const el = document.createElementNS(ns, 'text');
          el.setAttribute('x', '100');
          el.setAttribute('y', '200');
          el.setAttribute('font-family', family);
          el.setAttribute('font-size', String(size));
          el.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
          if (it.bold) el.setAttribute('font-weight', 'bold');
          if (it.italic) el.setAttribute('font-style', 'italic');
          el.textContent = it.text;
          svg.appendChild(el);
          const length = el.getComputedTextLength();
          svg.removeChild(el);
          return { length };
        });
        svg.remove();
        return { out, arial: document.fonts.check(`${size}px Arial`) };
      },
      { items: samples, size: FONT_SIZE, family: FAMILY },
    );
    const measured: Measured[] = lengths.out;

    // Rasterise every sample and scan for inked pixels.
    const inks: (Ink | null)[] = await page.evaluate(
      ({ items, size, family }) =>
        items.map((it) => {
          const probe = document.createElement('canvas').getContext('2d');
          if (!probe) throw new Error('no 2d canvas context');
          const font = `${it.italic ? 'italic ' : ''}${it.bold ? 'bold ' : ''}${size}px ${family}`;
          probe.font = font;
          const pad = size;
          const w = Math.ceil(probe.measureText(it.text).width) + 2 * pad;
          const h = 3 * size;
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) throw new Error('no 2d canvas context');
          ctx.font = font;
          ctx.fillStyle = '#000';
          ctx.fillText(it.text, pad, 2 * size);
          const px = ctx.getImageData(0, 0, w, h).data;
          let minX = w;
          let maxX = -1;
          let minY = h;
          let maxY = -1;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              if ((px[(y * w + x) * 4 + 3] as number) > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
          if (maxX < 0) return null;
          return {
            left: minX - pad,
            right: maxX + 1 - pad,
            top: minY - 2 * size,
            bottom: maxY + 1 - 2 * size,
          };
        }),
      { items: samples, size: BOX_FONT_SIZE, family: FAMILY },
    );

    let maxRel = 0;
    let maxAbs = 0;
    let maxOutside = 0;
    const widthFailures: string[] = [];
    const boxFailures: string[] = [];
    measured.forEach((m, i) => {
      const s = samples[i] as Sample;
      const runs = [{ text: s.text, bold: s.bold }];
      const expected = measureRuns(runs, style, FONT_SIZE);
      const label = `${JSON.stringify(s.text)}${s.bold ? ' bold' : ''}${s.italic ? ' italic' : ''}`;
      expect(expected.notices, `${label} must be covered by the table`).toEqual([]);

      const abs = Math.abs(m.length - expected.width);
      const rel = m.length === 0 ? 0 : abs / m.length;
      maxAbs = Math.max(maxAbs, abs);
      maxRel = Math.max(maxRel, rel);
      if (rel > REL_TOLERANCE || abs > ABS_TOLERANCE) {
        widthFailures.push(`${label}: table ${expected.width}, rendered ${m.length}`);
      }

      // The computed ink box about the origin: [-overhang, width + overhang] x [-ascent, descent].
      const ink = inks[i];
      if (!ink) return;
      const box = measureRuns(runs, style, BOX_FONT_SIZE);
      const over = OVERHANG_EM * BOX_FONT_SIZE;
      const out = Math.max(
        -over - ink.left,
        ink.right - (box.width + over),
        -box.inkAscent - ink.top,
        ink.bottom - box.inkDescent,
      );
      maxOutside = Math.max(maxOutside, out);
      if (out > EPS) {
        boxFailures.push(
          `${label}: ink ${JSON.stringify(ink)} leaves the box by ${out.toFixed(2)} px at ${BOX_FONT_SIZE} px`,
        );
      }
    });

    console.log(
      `calibration: ${measured.length} samples, max width error ${maxAbs.toFixed(3)} px ` +
        `(${(maxRel * 100).toFixed(3)} %) at ${FONT_SIZE} px, ` +
        `${boxFailures.length} glyph-box violations (max ${Math.max(0, maxOutside).toFixed(2)} px outside at ${BOX_FONT_SIZE} px)`,
    );
    expect(widthFailures).toEqual([]);
    expect(boxFailures).toEqual([]);
    expect(lengths.arial).toBe(true);
  } finally {
    await app.close();
  }
});
