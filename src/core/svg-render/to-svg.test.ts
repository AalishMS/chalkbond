import { describe, expect, it } from 'vitest';
import { inkScan } from './__fixtures__/ink-scan';
import { aceticAcid, benzene, ethanol, molecule } from './__fixtures__/molecules';
import { checkXml } from './__fixtures__/xml-check';
import { render } from './render';
import { ALLOWED_ATTRIBUTES, ALLOWED_ELEMENTS } from './svg-write';
import { renderSvg, toSvg } from './to-svg';

const near = (actual: number, expected: number, digits = 2) =>
  expect(actual).toBeCloseTo(expected, digits);

const scene = render(aceticAcid().doc);
const bounds = scene.bounds!;
const r3 = (n: number) => String(Math.round(n * 1000) / 1000);

function parsed(svg: string) {
  const { root, elements } = checkXml(svg);
  return { root, elements, group: elements.find((e) => e.name === 'g') };
}

describe('toSvg: empty', () => {
  const empty = toSvg(render(molecule([], []).doc));

  it('is a valid empty svg with no group', () => {
    const { root, elements } = parsed(empty.svg);
    expect(root.name).toBe('svg');
    expect(root.attrs['width']).toBe('0pt');
    expect(root.attrs['height']).toBe('0pt');
    expect(root.attrs['viewBox']).toBe('0 0 0 0');
    expect(elements.some((e) => e.name === 'g')).toBe(false);
    expect(empty.svg.endsWith('\n')).toBe(true);
  });

  it('has zero size and origin (0, 0), padding or not', () => {
    expect(empty.width).toBe(0);
    expect(empty.height).toBe(0);
    expect(empty.origin).toEqual({ x: 0, y: 0 });
    expect(toSvg(render(molecule([], []).doc), { padding: 10 }).width).toBe(0);
  });

  it('an empty subset gives the same form', () => {
    const sub = renderSvg(benzene().doc, {
      only: { atoms: new Set(), bonds: new Set(), objects: new Set() },
    });
    expect(sub.svg).toBe(empty.svg);
  });
});

describe('toSvg: wrapper', () => {
  const out = toSvg(scene);
  const { root, group } = parsed(out.svg);

  it('is tight by default: size is the ink size in pt, origin the ink corner', () => {
    near(out.width, bounds.w, 3);
    near(out.height, bounds.h, 3);
    expect(root.attrs['width']).toBe(`${out.width}pt`);
    expect(root.attrs['height']).toBe(`${out.height}pt`);
    expect(root.attrs['viewBox']).toBe(`0 0 ${out.width} ${out.height}`);
    expect(out.origin).toEqual({ x: bounds.x, y: bounds.y });
  });

  it('holds all parts in one translated group with round caps and joins', () => {
    const tx = r3(-bounds.x) === '-0' ? '0' : r3(-bounds.x);
    const ty = r3(-bounds.y) === '-0' ? '0' : r3(-bounds.y);
    expect(group!.attrs['transform']).toBe(`translate(${tx} ${ty})`);
    expect(group!.attrs['fill']).toBe('none');
    expect(group!.attrs['stroke-linecap']).toBe('round');
    expect(group!.attrs['stroke-linejoin']).toBe('round');
    expect(root.children.filter((c) => c.name === 'g')).toHaveLength(1);
  });

  it('the ink lands exactly on the viewBox', () => {
    const scan = inkScan(out.svg)!;
    near(scan.x - out.origin.x, 0, 2);
    near(scan.y - out.origin.y, 0, 2);
    near(scan.w, out.width, 2);
    near(scan.h, out.height, 2);
  });

  it('uses \\n line ends, ends with a newline and has no prolog or comments', () => {
    expect(out.svg).not.toContain('\r');
    expect(out.svg.endsWith('</svg>\n')).toBe(true);
    expect(out.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="')).toBe(true);
    expect(out.svg).not.toContain('<?');
    expect(out.svg).not.toContain('<!--');
  });

  it('the group content is exactly the parts joined by newlines', () => {
    expect(out.svg).toContain(`\n${scene.parts.map((p) => p.svg).join('\n')}\n</g>`);
  });

  it('only allow-listed elements and attributes', () => {
    const { elements } = parsed(toSvg(scene, { metadata: 'x' }).svg);
    for (const e of elements) {
      expect(ALLOWED_ELEMENTS as readonly string[]).toContain(e.name);
      const allowed = ALLOWED_ATTRIBUTES[
        e.name as keyof typeof ALLOWED_ATTRIBUTES
      ] as readonly string[];
      for (const a of e.attrNames) expect(allowed).toContain(a);
    }
  });

  it('is deterministic', () => {
    expect(toSvg(scene).svg).toBe(out.svg);
  });
});

describe('toSvg: padding and origin', () => {
  it('padding adds to every side and moves the origin', () => {
    const out = toSvg(scene, { padding: 5 });
    near(out.width, bounds.w + 10, 3);
    near(out.height, bounds.h + 10, 3);
    near(out.origin.x, bounds.x - 5, 9);
    near(out.origin.y, bounds.y - 5, 9);
    const scan = inkScan(out.svg)!;
    near(scan.x - out.origin.x, 5, 2);
    near(scan.y - out.origin.y, 5, 2);
  });

  it('a bad padding (negative, NaN, infinite, not a number) is treated as 0', () => {
    const tight = toSvg(scene).svg;
    for (const p of [-3, Number.NaN, Number.POSITIVE_INFINITY, '4' as unknown as number]) {
      expect(toSvg(scene, { padding: p }).svg).toBe(tight);
    }
  });

  it('benzene is centred on the origin, so its box is symmetric about it', () => {
    const out = renderSvg(benzene().doc, { padding: 2 });
    near(out.origin.x, -(out.width / 2), 1);
  });
});

describe('toSvg: metadata', () => {
  const nasty = 'a<b & "c" \'d\' ]]> </metadata><script>alert(1)</script>\u0001\ud800';

  it('is escaped text in the only metadata element, before the group', () => {
    const out = toSvg(scene, { metadata: nasty });
    const { root, elements } = parsed(out.svg);
    const meta = elements.filter((e) => e.name === 'metadata');
    expect(meta).toHaveLength(1);
    expect(meta[0]!.attrs['id']).toBe('chalkbond');
    expect(meta[0]!.text).toBe(nasty.replace('\u0001', '�').replace('\ud800', '�'));
    expect(elements.some((e) => e.name === 'script')).toBe(false);
    expect(root.children.map((c) => c.name)).toEqual(['metadata', 'g']);
  });

  it('is omitted when not given and does not change the geometry', () => {
    expect(toSvg(scene).svg).not.toContain('metadata');
    const withMeta = toSvg(scene, { metadata: 'x' });
    expect(withMeta.width).toBe(toSvg(scene).width);
    expect(withMeta.origin).toEqual(toSvg(scene).origin);
  });

  it('is kept in the empty form too', () => {
    const out = toSvg(render(molecule([], []).doc), { metadata: 'm' });
    expect(parsed(out.svg).elements.some((e) => e.name === 'metadata')).toBe(true);
    expect(parsed(out.svg).elements.some((e) => e.name === 'g')).toBe(false);
  });
});

describe('renderSvg', () => {
  it('equals toSvg(render(doc, opts), opts)', () => {
    const doc = ethanol().doc;
    const opts = { padding: 3, metadata: 'm' };
    expect(renderSvg(doc, opts)).toEqual(toSvg(render(doc), opts));
    expect(renderSvg(doc)).toEqual(toSvg(render(doc)));
  });

  it('draws a subset through `only`', () => {
    const m = ethanol();
    const sub = renderSvg(m.doc, {
      only: { atoms: new Set([m.atoms[2]!]), bonds: new Set(), objects: new Set() },
    });
    expect(sub.svg).toContain('>O</text>');
    expect(sub.svg).not.toContain('<path');
  });
});
