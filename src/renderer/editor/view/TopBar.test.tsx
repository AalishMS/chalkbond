import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { freshState as initialState } from '../state/testing';
import { EMPTY_SCOPE } from '../state/selection-actions';
import { TopBar } from './TopBar';

const render = (canUndo: boolean, canRedo: boolean): string =>
  renderToStaticMarkup(
    <TopBar
      state={initialState()}
      scope={EMPTY_SCOPE}
      canUndo={canUndo}
      canRedo={canRedo}
      dispatch={() => undefined}
    />,
  );

describe('TopBar markup', () => {
  it('has the name field with its placeholder and search icon', () => {
    const html = render(false, false);
    expect(html).toContain('placeholder="Type a compound name…"');
    expect(html).toContain('aria-label="Compound name"');
    expect(html).toContain('#search');
  });

  it('disables Undo and Redo while there is nothing to undo or redo', () => {
    const html = render(false, false);
    expect(html).toContain('aria-label="Undo (Ctrl+Z)" aria-disabled="true"');
    expect(html).toContain('aria-label="Redo (Ctrl+Y)" aria-disabled="true"');
  });

  it('enables Undo when there is something to undo', () => {
    const html = render(true, false);
    expect(html).not.toContain('aria-label="Undo (Ctrl+Z)" aria-disabled');
    expect(html).toContain('aria-label="Redo (Ctrl+Y)" aria-disabled="true"');
  });

  it('puts a divider between the name field and the options bar', () => {
    const html = render(false, false);
    expect(html.indexOf('class="divider-v"')).toBeGreaterThan(html.indexOf('namefield'));
    expect(html.indexOf('class="divider-v"')).toBeLessThan(html.indexOf('data-testid="options"'));
  });
});
