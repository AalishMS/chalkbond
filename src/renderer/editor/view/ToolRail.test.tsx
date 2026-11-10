import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { initialState } from '../state/editor-state';
import { reduce } from '../state/reducer';
import { ToolRail } from './ToolRail';

const render = (state = initialState()): string =>
  renderToStaticMarkup(<ToolRail state={state} dispatch={() => undefined} />);

describe('ToolRail markup', () => {
  const html = render();

  it('has ten buttons in rail order with captions and key labels', () => {
    const labels = [...html.matchAll(/aria-label="([^"]+)" aria-pressed/g)].map((m) => m[1]);
    expect(labels).toEqual([
      'Select (V)',
      'Erase (E)',
      'Bond (B)',
      'Chain (Z)',
      'Ring (R)',
      'Atom (L)',
      'Arrow (A)',
      'Plus (+)',
      'Curved arrow (M)',
      'Text (T)',
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

  it('presses exactly one button: Bond at launch', () => {
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Bond (B)" aria-pressed="true"');
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

  it('shows a mark option as its icon on the Atom button', () => {
    const s = reduce(initialState(), { type: 'select-variant', tool: 'atom', variant: 'plus' });
    const h = render(s);
    expect(h).toContain('#mark-plus');
    expect(h).not.toContain('rail-glyph');
  });
});
