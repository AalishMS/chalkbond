import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { setStyle, type Doc } from '@core/doc-model';
import type { ToolId } from '../state/editor-state';
import { drawn, freshState as initialState, reduceTest as reduce, testDoc } from '../state/testing';
import { EMPTY_SCOPE, type SelectionScope } from '../state/selection-actions';
import { OptionsBar } from './OptionsBar';

const render = (tool: ToolId, scope: SelectionScope = EMPTY_SCOPE, doc: Doc = testDoc()): string =>
  renderToStaticMarkup(
    <OptionsBar
      state={reduce(initialState(doc), { type: 'select-tool', tool })}
      scope={scope}
      dispatch={() => undefined}
    />,
  );

/** aria-labels inside the bar except the toolbar's own. */
const labels = (html: string): string[] =>
  [...html.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1] as string).slice(1);

describe('option sets', () => {
  it('Bond: five, Single pressed', () => {
    const html = render('bond');
    expect(labels(html)).toEqual(['Single', 'Double', 'Triple', 'Wedge', 'Hash']);
    expect(html).toContain('aria-label="Single" aria-pressed="true"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it('Ring: five in order', () => {
    expect(labels(render('ring'))).toEqual([
      'Benzene',
      'Cyclohexane',
      'Cyclopentane',
      'Cyclobutane',
      'Cyclopropane',
    ]);
  });

  it('Atom: ten elements, a separator, four marks, then delta plus and minus', () => {
    const html = render('atom');
    expect(labels(html)).toEqual([
      'Carbon',
      'Hydrogen',
      'Nitrogen',
      'Oxygen',
      'Sulfur',
      'Phosphorus',
      'Fluorine',
      'Chlorine',
      'Bromine',
      'Iodine',
      'Positive charge',
      'Negative charge',
      'Lone pair',
      'Radical',
      'Partial positive charge',
      'Partial negative charge',
    ]);
    expect(html.match(/role="separator"/g)).toHaveLength(1);
    expect(html).toContain('>δ+<');
    expect(html).toContain('>δ−<');
    expect(html).toContain('aria-label="Carbon" aria-pressed="true"');
  });

  it('Arrow: four; Curly: two', () => {
    expect(labels(render('arrow'))).toEqual([
      'Reaction',
      'Equilibrium',
      'Resonance',
      'No reaction',
    ]);
    expect(labels(render('curved'))).toEqual(['Electron pair', 'Single electron']);
  });

  it('Erase, Chain, Plus and Text have an empty bar', () => {
    for (const tool of ['erase', 'chain', 'plus', 'text'] as const) {
      expect(labels(render(tool))).toEqual([]);
    }
  });
});

describe('selection actions bar', () => {
  it('disables Clean up, Show Kekulé, Tidy and the flips on an empty scope, with the help text', () => {
    const html = render('select');
    expect(html).toContain('Clean up');
    expect(html).toContain('Show Kekulé');
    expect(html).toContain('Tidy reaction');
    for (const help of [
      'Draw a molecule first.',
      'No benzene ring here.',
      'Draw an arrow first.',
    ]) {
      expect(html).toContain(`data-tip-help="${help}"`);
    }
    expect(html.match(/data-tip-help="Select a molecule first\."/g)).toHaveLength(2);
    // Clean up, Kekulé, Tidy, both flips and (R51 U6) Show structural on an empty drawing.
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(6);
  });

  it('enables what the scope allows', () => {
    const html = render(
      'select',
      {
        ...EMPTY_SCOPE,
        hasFragment: true,
        hasSelection: true,
        hasArrow: true,
        hasAromatic15: true,
      },
      drawn({ name: 'ethanol', x: 0, y: 0 }),
    );
    expect(html).not.toContain('aria-disabled="true"');
  });

  it('renders Expand only with an abbreviation', () => {
    expect(render('select')).not.toContain('Expand');
    const html = render('select', { ...EMPTY_SCOPE, hasAbbreviation: true });
    expect(html).toContain('Expand');
    expect(html.match(/role="separator"/g)).toHaveLength(2);
  });

  it('labels the toggle Show circle for an aromatic non-1.5 bond', () => {
    const html = render('select', { ...EMPTY_SCOPE, hasAromaticNon15: true });
    expect(html).toContain('Show circle');
    expect(html).not.toContain('Show Kekulé');
  });

  it('reserves the width of the longer label on the toggle', () => {
    expect(render('select')).toContain('btn-kekule');
  });
});

describe('the formula switch (R51: U5, U6, U8; R53 U15)', () => {
  const ethanol = (): Doc => drawn({ name: 'ethanol', x: 0, y: 0 });
  const structural = (): Doc => setStyle(ethanol(), { formula: 'structural' });
  /** The attributes and content of the act-formula button. */
  const button = (html: string): string =>
    html.match(/<button[^>]*data-testid="act-formula"[^>]*>.*?<\/button>/s)?.[0] ?? '';

  it('is the button right after Show Kekulé and before Tidy reaction', () => {
    const html = render('select');
    const at = (id: string): number => html.indexOf(`data-testid="${id}"`);
    expect(at('act-kekule')).toBeGreaterThan(-1);
    expect(at('act-formula')).toBeGreaterThan(at('act-kekule'));
    expect(at('act-tidy')).toBeGreaterThan(at('act-formula'));
  });

  it('on a skeletal drawing: show-structural icon, "Show structural", its aria-label and the U15 help', () => {
    const b = button(render('select', EMPTY_SCOPE, ethanol()));
    expect(b).toContain('href="#show-structural"');
    expect(b).toContain('<span>Show structural</span>');
    expect(b).toContain('aria-label="Show structural formula"');
    expect(b).toContain('data-tip="Show structural formula"');
    expect(b).toContain(
      'data-tip-help="Writes the carbons outside rings with their hydrogens (CH3, CH2, CH); bonds become twice as long."',
    );
    expect(b).not.toContain('aria-disabled');
    expect(b).not.toContain('data-tip-key');
  });

  it('on a structural drawing: show-skeletal icon, "Show skeletal", always enabled', () => {
    const b = button(render('select', EMPTY_SCOPE, structural()));
    expect(b).toContain('href="#show-skeletal"');
    expect(b).toContain('<span>Show skeletal</span>');
    expect(b).toContain('aria-label="Show skeletal formula"');
    expect(b).toContain('data-tip="Show skeletal formula"');
    expect(b).toContain(
      'data-tip-help="Draws carbons as corners and line ends again, in the whole drawing."',
    );
    expect(b).not.toContain('aria-disabled');
  });

  it('an empty structural drawing still offers Show skeletal', () => {
    const b = button(render('select', EMPTY_SCOPE, setStyle(testDoc(), { formula: 'structural' })));
    expect(b).toContain('<span>Show skeletal</span>');
    expect(b).not.toContain('aria-disabled');
  });

  it('on an empty skeletal drawing it is disabled with "Draw a molecule first."', () => {
    const b = button(render('select'));
    expect(b).toContain('aria-disabled="true"');
    expect(b).toContain('data-tip-help="Draw a molecule first."');
    expect(b).toContain('<span>Show structural</span>');
  });

  it('ignores the selection (whole document)', () => {
    const b = button(render('select', { ...EMPTY_SCOPE, hasSelection: true }, ethanol()));
    expect(b).not.toContain('aria-disabled');
  });

  it('has a fixed-width class and is not shown for other tools', () => {
    expect(button(render('select', EMPTY_SCOPE, ethanol()))).toContain('btn-formula');
    expect(render('bond', EMPTY_SCOPE, ethanol())).not.toContain('act-formula');
  });
});
