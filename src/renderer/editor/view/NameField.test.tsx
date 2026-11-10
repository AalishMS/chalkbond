import { createNameIndex } from '@core/chem-core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import compounds from '../../../../resources/compounds/compounds.json';
import { suggestionRows } from '../model/suggestions';
import type { NameField as NameFieldState } from '../state/editor-state';
import { NameField } from './NameField';

const names = createNameIndex(compounds);
const noop = (): undefined => undefined;

const render = (field: Partial<NameFieldState>, text = field.text ?? ''): string => {
  const state: NameFieldState = { text, open: false, highlighted: 0, error: null, ...field };
  const rows = state.open ? suggestionRows(names, state.text) : [];
  return renderToStaticMarkup(<NameField field={state} rows={rows} dispatch={noop} />);
};

describe('NameField markup', () => {
  it('idle: an input labelled "Compound name" with no dropdown', () => {
    const html = render({});
    expect(html).toContain('aria-label="Compound name"');
    expect(html).toContain('placeholder="Type a compound name…"');
    expect(html).not.toContain('class="dropdown"');
    expect(html).toContain('aria-expanded="false"');
  });

  it('shows the typed text', () => {
    expect(render({ text: 'eth' })).toContain('value="eth"');
  });

  it('open: a listbox of eight rows, ethane first and highlighted, prefix bold, real <sub>', () => {
    const html = render({ text: 'eth', open: true });
    expect(html).toContain('class="dropdown" role="listbox" aria-label="Suggestions"');
    const rows = [...html.matchAll(/role="option"/g)];
    expect(rows).toHaveLength(8);
    expect(html).toContain('<b>eth</b>ane');
    expect(html).toContain('C<sub>2</sub>H<sub>6</sub>');
    expect(html).toMatch(/aria-selected="true"[^>]*>.{0,120}<b>eth<\/b>ane/);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toContain('aria-expanded="true"');
  });

  it('the highlight follows state', () => {
    const html = render({ text: 'eth', open: true, highlighted: 1 });
    expect(html).toMatch(/aria-selected="true"[^>]*>.{0,120}<b>eth<\/b>ene/);
  });

  it('a synonym row shows the display name after a muted dash (R10)', () => {
    const html = render({ text: 'ethanoic', open: true });
    expect(html).toContain('<b>ethanoic</b> acid');
    expect(html).toContain('<span class="dropdown-alias"> — acetic acid</span>');
  });

  it('not found: an alert with the warning row, "Did you mean" and chips in order', () => {
    const html = render({
      text: 'ethanl',
      error: {
        message: 'No compound named “ethanl”.',
        suggestions: ['ethanol', 'ethane', 'acetaldehyde'],
      },
    });
    expect(html).toContain('class="dropdown" role="alert"');
    expect(html).toContain('<span>No compound named “ethanl”.</span>');
    expect(html).toContain('Did you mean');
    const chips = [...html.matchAll(/class="chip"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(chips).toEqual(['ethanol', 'ethane', 'acetaldehyde']);
    expect(html).toContain('class="namefield is-notfound"');
    expect(html).toContain('href="#warning"');
  });

  it('too large: the message and no "Did you mean"', () => {
    const html = render({
      text: 'x',
      error: { message: 'That structure is too big to draw (over 1000 atoms).', suggestions: [] },
    });
    expect(html).toContain('That structure is too big');
    expect(html).not.toContain('Did you mean');
  });
});
