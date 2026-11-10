// Test helper: a small well-formedness checker for the SVG this module writes (no DOM, no
// dependency). Accepts the XML subset the writer emits: elements, double-quoted attributes,
// text, the five predefined entities. Rejects everything else (comments, CDATA, PIs, DOCTYPE,
// numeric references, single-quoted attributes, illegal characters). Returns the element tree
// and a flat element list so tests can check allow-lists and attribute order.

export interface XmlElement {
  name: string;
  /** Attribute names in document order. */
  attrNames: string[];
  attrs: Record<string, string>;
  /** Concatenated, entity-decoded character data directly inside this element. */
  text: string;
  children: XmlElement[];
}

export interface XmlCheckResult {
  root: XmlElement;
  /** Every element, document order. */
  elements: XmlElement[];
}

export class XmlCheckError extends Error {
  constructor(message: string, offset: number) {
    super(`${message} (at offset ${offset})`);
    this.name = 'XmlCheckError';
  }
}

const NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

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

function decode(raw: string, offset: number): string {
  return raw.replace(/&([^;&\s]*);?/g, (whole, name: string) => {
    const value = whole.endsWith(';') ? ENTITIES[name] : undefined;
    if (value === undefined) throw new XmlCheckError(`bad entity "${whole}"`, offset);
    return value;
  });
}

export function checkXml(xml: string): XmlCheckResult {
  for (let i = 0; i < xml.length;) {
    const cp = xml.codePointAt(i)!;
    if (!isXmlChar(cp)) {
      throw new XmlCheckError(`illegal character U+${cp.toString(16).toUpperCase()}`, i);
    }
    i += cp > 0xffff ? 2 : 1;
  }

  const elements: XmlElement[] = [];
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  let pos = 0;

  const textInto = (raw: string, offset: number) => {
    if (raw === '') return;
    if (raw.includes(']]>')) throw new XmlCheckError('"]]>" in character data', offset);
    const top = stack[stack.length - 1];
    if (!top) {
      if (raw.trim() !== '') throw new XmlCheckError('text outside the root element', offset);
      return;
    }
    top.text += decode(raw, offset);
  };

  while (pos < xml.length) {
    const lt = xml.indexOf('<', pos);
    if (lt === -1) {
      textInto(xml.slice(pos), pos);
      break;
    }
    textInto(xml.slice(pos, lt), pos);
    const gt = findTagEnd(xml, lt);
    const tag = xml.slice(lt + 1, gt);
    pos = gt + 1;

    if (tag.startsWith('/')) {
      const name = tag.slice(1).trim();
      const top = stack.pop();
      if (!top || top.name !== name) {
        throw new XmlCheckError(`unbalanced closing tag </${name}>`, lt);
      }
      continue;
    }
    if (tag.startsWith('!') || tag.startsWith('?')) {
      throw new XmlCheckError('comments, CDATA, DOCTYPE and PIs are not allowed', lt);
    }
    const selfClosing = tag.endsWith('/');
    const el = parseTag(selfClosing ? tag.slice(0, -1) : tag, lt);
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(el);
    else if (root) throw new XmlCheckError('more than one root element', lt);
    else root = el;
    elements.push(el);
    if (!selfClosing) stack.push(el);
  }

  const open = stack[stack.length - 1];
  if (open) throw new XmlCheckError(`unclosed element <${open.name}>`, xml.length);
  if (!root) throw new XmlCheckError('no root element', 0);
  return { root, elements };
}

/** Index of the `>` ending the tag that starts at `lt`, skipping quoted attribute values. */
function findTagEnd(xml: string, lt: number): number {
  let quote: string | null = null;
  for (let i = lt + 1; i < xml.length; i++) {
    const ch = xml[i]!;
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '<') throw new XmlCheckError('"<" inside a tag', i);
    else if (ch === '>') return i;
  }
  throw new XmlCheckError('unterminated tag', lt);
}

function parseTag(body: string, offset: number): XmlElement {
  const head = /^([^\s=]+)/.exec(body);
  if (!head || !NAME.test(head[1]!)) throw new XmlCheckError('bad element name', offset);
  const el: XmlElement = { name: head[1]!, attrNames: [], attrs: {}, text: '', children: [] };
  let rest = body.slice(head[1]!.length);
  const attr = /^\s+([^\s=]+)="([^"]*)"/;
  for (;;) {
    const m = attr.exec(rest);
    if (!m) break;
    const [whole, name, value] = m as unknown as [string, string, string];
    if (!NAME.test(name)) throw new XmlCheckError(`bad attribute name "${name}"`, offset);
    if (Object.hasOwn(el.attrs, name)) {
      throw new XmlCheckError(`duplicate attribute "${name}"`, offset);
    }
    if (value.includes('<')) throw new XmlCheckError('"<" in attribute value', offset);
    el.attrNames.push(name);
    el.attrs[name] = decode(value, offset);
    rest = rest.slice(whole.length);
  }
  if (rest.trim() !== '') throw new XmlCheckError(`bad attribute syntax near "${rest}"`, offset);
  return el;
}
