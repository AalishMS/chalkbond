import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { freshState as initialState, reduceTest as reduce } from '../state/testing';
import { ToolRail } from './ToolRail';

const render = (state = initialState()): string =>
  renderToStaticMarkup(<ToolRail state={state} dispatch={() => undefined} />);

describe('ToolRail markup', () => {
  const html = render();

  it('has ten buttons in rail order with captions and names without keys (R50 U2)', () => {
    const labels = [...html.matchAll(/aria-label="([^"]+)" aria-pressed/g)].map((m) => m[1]);
    expect(labels).toEqual([
      'Select',
      'Erase',
      'Bond',
      'Chain',
      'Ring',
      'Atom',
      'Arrow',
      'Plus',
      'Curved arrow',
      'Text',
    ]);
    const captions = [...html.matchAll(/class="rail-caption"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(captions).toEqual([
      'Select',
      'Erase',
      'Bond',
      'Chain',
      'Ring',
      'Atom',
      'Arrow',
      'Plus',
      'Curly',
      'Text',
    ]);
  });

  it('every button has one aria-hidden digit badge, first, and both keys in aria-keyshortcuts (R50)', () => {
    const buttons = html.split('<button').slice(1);
    expect(buttons).toHaveLength(10);
    const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    buttons.forEach((b, i) => {
      expect(b.match(/class="rail-key"/g)).toHaveLength(1);
      expect(b).toContain('<span class="rail-key" aria-hidden="true">' + digits[i] + '</span>');
      expect(b.indexOf('rail-key')).toBeLessThan(b.indexOf('rail-caption'));
    });
    expect(html).toContain('aria-keyshortcuts="3 B"');
    expect(html).toContain('aria-keyshortcuts="8 Plus"');
    expect(html).toContain('aria-keyshortcuts="1 V"');
    expect(html).toContain('aria-keyshortcuts="0 T"');
  });

  it('presses exactly one button: Bond at launch', () => {
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Bond" aria-pressed="true"');
  });

  it('has two separators between the three groups', () => {
    expect(html.match(/role="separator"/g)).toHaveLength(2);
  });

  it('shows the current option on the Bond, Ring, Atom, Arrow and Curly buttons', () => {
    expect(html).toContain('#bond-single');
    expect(html).toContain('#ring-benzene');
    expect(html).toContain('<span class="rail-glyph">C</span>');
    expect(html).toContain('#arrow-forward');
    expect(html).toContain('#curved-full');
    let s = initialState();
    s = reduce(s, { type: 'select-variant', tool: 'ring', variant: 'cyclopentane' });
    s = reduce(s, { type: 'select-variant', tool: 'atom', variant: 'N' });
    s = reduce(s, { type: 'select-variant', tool: 'bond', variant: 'wedge' });
    const h = render(s);
    expect(h).toContain('#ring-5');
    expect(h).toContain('<span class="rail-glyph">N</span>');
    expect(h).toContain('#bond-wedge');
  });

  it('shows the chosen element on the Atom button: Cl after choosing Chlorine (screen 05)', () => {
    const s = reduce(initialState(), { type: 'select-variant', tool: 'atom', variant: 'Cl' });
    const h = render(s);
    expect(h).toContain('<span class="rail-glyph">Cl</span>');
    expect(h).not.toContain('#mark-plus');
  });

  it('shows a mark option as its icon on the Atom button', () => {
    const s = reduce(initialState(), { type: 'select-variant', tool: 'atom', variant: 'plus' });
    const h = render(s);
    expect(h).toContain('#mark-plus');
    expect(h).not.toContain('rail-glyph');
  });
});
