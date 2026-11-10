import { describe, expect, it } from 'vitest';
import { checkXml } from './__fixtures__/xml-check';
import { INK } from './style';
import {
  ALLOWED_ATTRIBUTES,
  ALLOWED_ELEMENTS,
  cleanXmlText,
  el,
  escapeAttr,
  escapeText,
  safeColor,
  safeFontFamily,
  SVG_NS,
  svgGroup,
  svgMetadata,
  svgRoot,
  svgText,
  type SvgAttrs,
} from './svg-write';

describe('cleanXmlText', () => {
  it('keeps legal text, tab, newline and astral characters', () => {
    expect(cleanXmlText('a\tb\nc😀é')).toBe('a\tb\nc😀é');
  });

  it('turns control characters, U+FFFE/U+FFFF and lone surrogates into U+FFFD', () => {
    expect(cleanXmlText('a\u0000b\u0001c\u001fd\u000be')).toBe('a�b�c�d�e');
    expect(cleanXmlText('￾￿')).toBe('��');
    expect(cleanXmlText('x\uD800y')).toBe('x�y');
    expect(cleanXmlText('x\uDC00y')).toBe('x�y');
    expect(cleanXmlText('\uD83D')).toBe('�');
  });

  it('keeps a valid surrogate pair intact', () => {
    expect(cleanXmlText('😀')).toBe('😀');
  });

  it('normalises CR and CRLF to LF', () => {
    expect(cleanXmlText('a\r\nb\rc')).toBe('a\nb\nc');
  });
});

describe('escapeText / escapeAttr', () => {
  it('escapes & < > " \'', () => {
    expect(escapeText(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &apos;');
    expect(escapeAttr(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &apos;');
  });

  it('escapes & first, so entities are not double-escaped wrongly', () => {
    expect(escapeText('&lt;')).toBe('&amp;lt;');
  });

  it('covers "]]>" through ">" escaping', () => {
    expect(escapeText(']]>')).toBe(']]&gt;');
  });

  it('cleans illegal characters while escaping', () => {
    expect(escapeText('a\u0001<')).toBe('a�&lt;');
    expect(escapeAttr('\uD800')).toBe('�');
  });

  it('keeps newlines in text but not in attributes', () => {
    expect(escapeText('a\nb')).toBe('a\nb');
    expect(escapeAttr('a\nb\tc')).toBe('a b c');
  });

  it('never leaves a raw markup character, for hostile strings', () => {
    for (const s of ['<script>alert(1)</script>', '"onload="x', ']]>', '&#x41;', '😀<\u0000>']) {
      const out = escapeText(s);
      expect(out).not.toMatch(/[<>"']/);
      expect(out.replace(/&(amp|lt|gt|quot|apos);/g, '')).not.toContain('&');
    }
  });
});

describe('safeColor', () => {
  it('lower-cases a valid #rrggbb', () => {
    expect(safeColor('#AbCdEf')).toBe('#abcdef');
    expect(safeColor('#000000')).toBe('#000000');
  });

  it.each([
    '#fff',
    '#12345',
    '#1234567',
    '#gggggg',
    'red',
    'rgb(0,0,0)',
    'url(#x)',
    '',
    ' #000000',
    '#000000;',
    '#000000"',
    '#00000\n',
    null,
    undefined,
    42,
    {},
  ])('falls back to INK for %j', (bad) => {
    expect(safeColor(bad)).toBe(INK);
  });
});

describe('safeFontFamily', () => {
  it('removes quotes and ;{} characters', () => {
    expect(safeFontFamily('"Segoe UI", \'Arial\'; {x}')).toBe('Segoe UI, Arial x');
  });

  it('cuts to 200 characters', () => {
    expect(safeFontFamily('a'.repeat(250))).toBe('a'.repeat(200));
  });

  it('falls back to the preset family when empty after cleaning', () => {
    expect(safeFontFamily('"";{}')).toBe('Arial, Helvetica, sans-serif');
    expect(safeFontFamily('')).toBe('Arial, Helvetica, sans-serif');
    expect(safeFontFamily(undefined)).toBe('Arial, Helvetica, sans-serif');
    expect(safeFontFamily('', 'Times, serif')).toBe('Times, serif');
  });
});

describe('element builders', () => {
  it('writes attributes in the fixed per-element order, whatever the input order', () => {
    const a = el('path', { stroke: '#000000', 'stroke-width': 2, d: 'M 0 0 L 1 1', fill: 'none' });
    const b = el('path', { d: 'M 0 0 L 1 1', fill: 'none', 'stroke-width': 2, stroke: '#000000' });
    expect(a).toBe(b);
    expect(a).toBe('<path d="M 0 0 L 1 1" fill="none" stroke="#000000" stroke-width="2"/>');
  });

  it('never writes an undefined attribute', () => {
    const out = el('circle', { cx: 1, cy: 2, r: 3, fill: undefined, stroke: undefined });
    expect(out).toBe('<circle cx="1" cy="2" r="3"/>');
    expect(out).not.toContain('undefined');
  });

  it('formats numbers through fmt', () => {
    expect(el('rect', { x: 0.0004, y: -0, width: 1.23456, height: 100 })).toBe(
      '<rect x="0" y="0" width="1.235" height="100"/>',
    );
  });

  it('rejects non-finite numbers', () => {
    expect(() => el('circle', { cx: NaN, cy: 0, r: 1 })).toThrow();
    expect(() => el('circle', { cx: 0, cy: 0, r: Infinity })).toThrow();
  });

  it('falls back to INK for a bad fill or stroke colour and accepts none', () => {
    expect(el('polygon', { points: '0,0 1,0 1,1', fill: 'javascript:1' })).toBe(
      '<polygon points="0,0 1,0 1,1" fill="#000000"/>',
    );
    expect(el('ellipse', { cx: 0, cy: 0, rx: 1, ry: 2, fill: '#ABCDEF', stroke: 'none' })).toBe(
      '<ellipse cx="0" cy="0" rx="1" ry="2" fill="#abcdef" stroke="none"/>',
    );
    expect(el('rect', { x: 0, y: 0, width: 1, height: 1, stroke: 'url(#a)' })).toContain(
      'stroke="#000000"',
    );
  });

  it('builds the five shape elements', () => {
    expect(el('circle', { cx: 1, cy: 2, r: 3, 'fill-opacity': 0.25 })).toBe(
      '<circle cx="1" cy="2" r="3" fill-opacity="0.25"/>',
    );
    expect(el('path', { d: 'M0 0Q1 1 2 0C1 2,3 4,5 6Z' })).toContain(
      'd="M0 0Q1 1 2 0C1 2,3 4,5 6Z"',
    );
    expect(
      el('path', {
        d: 'M 0 0',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-dasharray': '10 6',
      }),
    ).toBe(
      '<path d="M 0 0" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="10 6"/>',
    );
  });

  it('rejects an attribute that is not allowed on that element', () => {
    expect(() => el('circle', { d: 'M 0 0' } as SvgAttrs)).toThrow(/not allowed/);
    expect(() => el('path', { onload: 'x' } as unknown as SvgAttrs)).toThrow(/not allowed/);
    expect(() => el('rect', { href: 'x' } as unknown as SvgAttrs)).toThrow(/not allowed/);
    expect(() => el('rect', { 'xlink:href': 'x' } as unknown as SvgAttrs)).toThrow(/not allowed/);
    expect(() => el('path', { style: 'x' } as unknown as SvgAttrs)).toThrow(/not allowed/);
    expect(() => el('rect', { id: 'x' } as unknown as SvgAttrs)).toThrow(/not allowed/);
    expect(() => el('rect', { 'xml:space': 'preserve' } as unknown as SvgAttrs)).toThrow(
      /not allowed/,
    );
  });

  it.each([
    'script',
    'style',
    'foreignObject',
    'use',
    'image',
    'a',
    'defs',
    'clipPath',
    'linearGradient',
    'title',
    'tspan',
    'constructor',
    '__proto__',
  ])('rejects the element <%s>', (name) => {
    expect(() => el(name as 'path', {})).toThrow(/not allowed/);
  });

  it('rejects unsafe values for string attributes', () => {
    expect(() => el('path', { d: 'url(#x)' })).toThrow();
    expect(() => el('path', { d: 'M 0 0 "' })).toThrow();
    expect(() => el('polygon', { points: '0,0 <1,1>' })).toThrow();
    expect(() => el('path', { d: 'M 0 0', 'stroke-linecap': 'x"y' as 'round' })).toThrow();
    expect(() => el('path', { d: 'M 0 0', 'stroke-dasharray': 'url(#a)' })).toThrow();
    expect(() => svgGroup({ transform: 'url(#a)' }, [])).toThrow();
  });

  it('never emits url(...), href or event attributes through any builder', () => {
    const outputs = [
      el('path', { d: 'M 0 0', fill: 'url(#x)', stroke: 'url(javascript:1)' }),
      svgText({ x: 0, y: 0, fill: 'url(#x)', 'font-family': 'url(http://x)' }, 'url(#x)'),
    ];
    for (const out of outputs) {
      expect(out).not.toMatch(/href|onload|onclick|<script|<style|<use|<image|foreignObject/i);
      expect(out.replace(/>[^<]*</g, '><')).not.toContain('url(');
    }
  });
});

describe('svgText', () => {
  it('writes xml:space and escapes the content', () => {
    const out = svgText(
      { x: 1.5, y: 2, 'font-family': 'Arial', 'font-size': 28, fill: '#FF0000', stroke: 'none' },
      'a < b & "c"',
    );
    expect(out).toBe(
      '<text x="1.5" y="2" font-family="Arial" font-size="28" fill="#ff0000" stroke="none" xml:space="preserve">a &lt; b &amp; &quot;c&quot;</text>',
    );
  });

  it('sanitises the font family and writes weight and style in a fixed place', () => {
    const out = svgText(
      { 'font-style': 'italic', 'font-weight': 'bold', 'font-family': '"A";{b}', x: 0, y: 0 },
      'x',
    );
    expect(out).toBe(
      '<text x="0" y="0" font-family="Ab" font-weight="bold" font-style="italic" xml:space="preserve">x</text>',
    );
  });

  it('keeps user text out of markup, even when it looks like markup', () => {
    const hostile = '</text><script>alert(1)</script><text x="0">]]>&#x41;';
    const { elements } = checkXml(`<svg>${svgText({ x: 0, y: 0 }, hostile)}</svg>`);
    expect(elements.map((e) => e.name)).toEqual(['svg', 'text']);
    expect(elements[1]!.text).toBe(hostile);
  });

  it('replaces illegal characters in the content', () => {
    const { elements } = checkXml(svgText({ x: 0, y: 0 }, 'a\u0001b\uD800c'));
    expect(elements[0]!.text).toBe('a�b�c');
  });

  it('rejects unsafe font-weight and font-style values', () => {
    expect(() => svgText({ x: 0, y: 0, 'font-weight': '900' as 'bold' }, 'x')).toThrow();
    expect(() => svgText({ x: 0, y: 0, 'font-style': 'oblique' as 'italic' }, 'x')).toThrow();
  });
});

describe('svgMetadata, svgGroup, svgRoot', () => {
  it('metadata is the only element with an id, text escaped', () => {
    const out = svgMetadata('{"a":"<b>&"}');
    expect(out).toBe(
      '<metadata id="chalkbond">{&quot;a&quot;:&quot;&lt;b&gt;&amp;&quot;}</metadata>',
    );
    expect(checkXml(out).root.text).toBe('{"a":"<b>&"}');
  });

  it('group writes children one per line, no indentation', () => {
    const out = svgGroup({ transform: 'translate(-1.5 -2)', fill: 'none' }, [
      el('circle', { cx: 0, cy: 0, r: 1 }),
      el('rect', { x: 0, y: 0, width: 1, height: 1 }),
    ]);
    expect(out).toBe(
      '<g transform="translate(-1.5 -2)" fill="none">\n<circle cx="0" cy="0" r="1"/>\n<rect x="0" y="0" width="1" height="1"/>\n</g>',
    );
    expect(checkXml(out).elements).toHaveLength(3);
  });

  it('root carries the namespace and pt sizes', () => {
    const out = svgRoot({ width: '10.5pt', height: 20, viewBox: '0 0 10.5 20' }, ['<g/>']);
    expect(out).toBe(
      `<svg xmlns="${SVG_NS}" width="10.5pt" height="20pt" viewBox="0 0 10.5 20">\n<g/>\n</svg>\n`,
    );
    expect(checkXml(out).root.attrs.xmlns).toBe('http://www.w3.org/2000/svg');
  });

  it('root without children is a valid empty document', () => {
    const out = svgRoot({ width: 0, height: 0, viewBox: '0 0 0 0' }, []);
    expect(out).toBe(
      `<svg xmlns="${SVG_NS}" width="0pt" height="0pt" viewBox="0 0 0 0">\n</svg>\n`,
    );
    checkXml(out);
  });

  it('root rejects a bad viewBox or size', () => {
    expect(() => svgRoot({ width: 1, height: 1, viewBox: 'a b c d' }, [])).toThrow();
    expect(() => svgRoot({ width: '1em', height: 1, viewBox: '0 0 1 1' }, [])).toThrow();
    expect(() => svgRoot({ width: NaN, height: 1, viewBox: '0 0 1 1' }, [])).toThrow();
  });

  it('metadata inside a root is well-formed and listed first', () => {
    const out = svgRoot({ width: 1, height: 1, viewBox: '0 0 1 1' }, [svgMetadata('m')]);
    expect(checkXml(out).elements.map((e) => e.name)).toEqual(['svg', 'metadata']);
  });
});

describe('allow-lists', () => {
  it('lists exactly the spec elements', () => {
    expect([...ALLOWED_ELEMENTS].sort()).toEqual(
      ['svg', 'g', 'path', 'polygon', 'circle', 'ellipse', 'rect', 'text', 'metadata'].sort(),
    );
  });

  it('uses only spec attributes', () => {
    const spec = new Set(
      (
        'd points cx cy r rx ry x y width height transform viewBox xmlns xml:space fill ' +
        'fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray ' +
        'font-family font-size font-weight font-style id'
      ).split(' '),
    );
    for (const [element, attrs] of Object.entries(ALLOWED_ATTRIBUTES)) {
      for (const a of attrs) expect(spec.has(a), `${element}.${a}`).toBe(true);
    }
    const used = new Set(Object.values(ALLOWED_ATTRIBUTES).flat());
    for (const a of spec) expect(used.has(a as never), a).toBe(true);
  });

  it('allows id only on metadata and xml:space only on text', () => {
    for (const [element, attrs] of Object.entries(ALLOWED_ATTRIBUTES)) {
      expect((attrs as readonly string[]).includes('id')).toBe(element === 'metadata');
      expect((attrs as readonly string[]).includes('xml:space')).toBe(element === 'text');
    }
  });

  it('allows no event, href or style attributes anywhere', () => {
    for (const attrs of Object.values(ALLOWED_ATTRIBUTES)) {
      for (const a of attrs) expect(a).not.toMatch(/^on|href|^style$/);
    }
  });
});
