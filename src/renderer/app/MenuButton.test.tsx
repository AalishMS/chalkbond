// TB26 markup (SPEC-app-shell.md M4, R32, V3; mock-up A19): the ☰ button's name, ARIA state,
// tooltip text and CSS contract. Its behaviour with the host is in `host.test.ts` and e2e.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MENU_TIP, MenuButton, MenuButtonView, type MenuButtonHost } from './MenuButton';

const view = (open = false, disabled = false): string =>
  renderToStaticMarkup(
    <MenuButtonView open={open} disabled={disabled} onPress={() => undefined} />,
  );

describe('MenuButtonView (M4)', () => {
  it('is a button named Menu with a menu popup and its test id', () => {
    const html = view();
    expect(html).toMatch(/^<button /);
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Menu"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('data-testid="app-menu"');
    expect(html).toContain('class="btn btn-top btn-menu"');
  });

  it('draws the menu icon at 20 px, hidden from assistive technology', () => {
    expect(view()).toContain(
      '<svg class="icon icon-20" aria-hidden="true"><use href="#menu"></use></svg>',
    );
  });

  it('aria-expanded is false at rest and true while the popup is open', () => {
    expect(view(false)).toContain('aria-expanded="false"');
    expect(view(true)).toContain('aria-expanded="true"');
  });

  it('V3: disabled while a dialog is open is aria-disabled, never the disabled attribute', () => {
    expect(view(false, true)).toContain('aria-disabled="true"');
    expect(view(false, true)).not.toMatch(/ disabled/);
    expect(view(false, false)).not.toContain('aria-disabled');
  });

  it('A19: the tooltip title is exactly "Menu (Alt or F10)" with the help line', () => {
    expect(MENU_TIP).toEqual({ title: 'Menu (Alt or F10)', help: 'File, Edit, View and Help.' });
    const html = view();
    expect(html).toContain('data-ui-tip="Menu (Alt or F10)"');
    expect(html).toContain('data-ui-tip-help="File, Edit, View and Help."');
    expect(html).toContain('data-ui-tip-side="below"');
  });
});

describe('MenuButton (host binding)', () => {
  const host = (open: boolean, modal: boolean): MenuButtonHost => ({
    appMenu: {
      open: () => Promise.resolve(),
      isOpen: () => open,
      subscribe: () => () => undefined,
    },
    modal: () => modal,
  });

  it('shows the host state', () => {
    expect(renderToStaticMarkup(<MenuButton host={host(true, false)} />)).toContain(
      'aria-expanded="true"',
    );
    expect(renderToStaticMarkup(<MenuButton host={host(false, true)} />)).toContain(
      'aria-disabled="true"',
    );
  });
});
