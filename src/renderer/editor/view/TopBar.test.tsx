import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { freshState as initialState } from '../state/testing';
import { EMPTY_SCOPE } from '../state/selection-actions';
import { TopBar } from './TopBar';

const render = (canUndo: boolean, canRedo: boolean, actions?: React.ReactNode): string =>
  renderToStaticMarkup(
    <TopBar
      actions={actions}
      state={initialState()}
      scope={EMPTY_SCOPE}
      canUndo={canUndo}
      canRedo={canRedo}
      rows={[]}
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

it('renders optional host actions last after history, preserving DOM tab order', () => {
  const html = render(true, true, <button>Host action</button>);
  expect(html).toContain('class="topbar has-actions"');
  expect(html).toMatch(
    /<div class="topbar-actions" data-testid="topbar-actions"><button>Host action<\/button><\/div><\/header>$/,
  );
  const ids = ['namefield-input', 'options', 'undo', 'redo', 'topbar-actions'];
  const positions = ids.map((id) => html.indexOf('data-testid="' + id + '"'));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  const bare = render(false, false);
  expect(bare).not.toContain('has-actions');
  expect(bare).not.toContain('topbar-actions');
});

it('renders the optional host menu first, before the name field, and says so on the header', () => {
  const withMenu = renderToStaticMarkup(
    <TopBar
      menu={<button>Menu</button>}
      state={initialState()}
      scope={EMPTY_SCOPE}
      canUndo={false}
      canRedo={false}
      rows={[]}
      dispatch={() => undefined}
    />,
  );
  expect(withMenu).toMatch(
    /^<header class="topbar has-menu" data-testid="topbar"><button>Menu<\/button>/,
  );
  expect(withMenu.indexOf('<button>Menu</button>')).toBeLessThan(withMenu.indexOf('namefield'));
  const bare = render(false, false);
  expect(bare).toMatch(/^<header class="topbar" data-testid="topbar"><label class="namefield"/);
  expect(bare).not.toContain('has-menu');
});
