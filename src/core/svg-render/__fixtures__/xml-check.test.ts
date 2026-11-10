import { describe, expect, it } from 'vitest';
import { checkXml, XmlCheckError } from './xml-check';

describe('xml-check: accepts', () => {
  it('a nested document and returns elements and attributes in order', () => {
    const { root, elements } = checkXml(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10pt">\n<g fill="none">\n<path d="M 0 0 L 1 1" stroke="#000000"/>\n</g>\n<text x="1" y="2">a &amp; b</text>\n</svg>\n',
    );
    expect(root.name).toBe('svg');
    expect(elements.map((e) => e.name)).toEqual(['svg', 'g', 'path', 'text']);
    expect(elements[2]!.attrNames).toEqual(['d', 'stroke']);
    expect(elements[2]!.attrs.d).toBe('M 0 0 L 1 1');
    expect(elements[3]!.text).toBe('a & b');
    expect(root.children.map((c) => c.name)).toEqual(['g', 'text']);
  });

  it('all five entities in text and attributes', () => {
    const { root } = checkXml('<a v="&lt;&gt;&amp;&quot;&apos;">&lt;&gt;&amp;&quot;&apos;</a>');
    expect(root.attrs.v).toBe('<>&"\'');
    expect(root.text).toBe('<>&"\'');
  });

  it('a ">" inside an attribute value and tab/newline/CR text', () => {
    expect(checkXml('<a v=">">\t\r\n</a>').root.attrs.v).toBe('>');
  });

  it('astral characters', () => {
    expect(checkXml('<a>😀</a>').root.text).toBe('😀');
  });
});

describe('xml-check: rejects', () => {
  it.each([
    ['unbalanced tags', '<a><b></a>'],
    ['an unclosed element', '<a><b/>'],
    ['a stray closing tag', '<a/></a>'],
    ['two roots', '<a/><b/>'],
    ['no root', '  '],
    ['text outside the root', 'x<a/>'],
    ['a bare ampersand', '<a>a & b</a>'],
    ['an unknown entity', '<a>&nbsp;</a>'],
    ['a numeric reference', '<a>&#65;</a>'],
    ['an entity without semicolon', '<a>&amp</a>'],
    ['a raw "<" in an attribute', '<a v="<"/>'],
    ['single-quoted attributes', "<a v='1'/>"],
    ['unquoted attributes', '<a v=1/>'],
    ['duplicate attributes', '<a v="1" v="2"/>'],
    ['a bad attribute name', '<a 1v="1"/>'],
    ['a bad element name', '<1a/>'],
    ['a comment', '<a><!-- x --></a>'],
    ['CDATA', '<a><![CDATA[x]]></a>'],
    ['a processing instruction', '<?xml version="1.0"?><a/>'],
    ['"]]>" in text', '<a>]]></a>'],
    ['an unterminated tag', '<a v="1"'],
    ['a control character', '<a>\u0001</a>'],
    ['U+FFFE', '<a>￾</a>'],
    ['a lone high surrogate', '<a>\uD800</a>'],
    ['a lone low surrogate', '<a>\uDC00</a>'],
  ])('%s', (_label, xml) => {
    expect(() => checkXml(xml)).toThrow(XmlCheckError);
  });
});
