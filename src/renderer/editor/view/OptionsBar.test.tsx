import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { initialState, type ToolId } from '../state/editor-state';
import { reduce } from '../state/reducer';
import { EMPTY_SCOPE, type SelectionScope } from '../state/selection-actions';
import { OptionsBar } from './OptionsBar';

const render = (tool: ToolId, scope: SelectionScope = EMPTY_SCOPE): string =>
  renderToStaticMarkup(
    <OptionsBar
      state={reduce(initialState(), { type: 'select-tool', tool })}
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
      expect(html).toContain(`aria-disabled="true" data-help="${help}"`);
    }
    expect(html.match(/aria-disabled="true" data-help="Select a molecule first\."/g)).toHaveLength(
      2,
    );
  });

  it('enables what the scope allows', () => {
    const html = render('select', {
      ...EMPTY_SCOPE,
      hasFragment: true,
      hasSelection: true,
      hasArrow: true,
      hasAromatic15: true,
    });
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
