// TB24 markup (SPEC-app-shell.md T2, T3, T5, T6, T16; mock-up A18): the strip's roles, names,
// markers, tooltip texts, roving tab stop, keyboard table and its CSS contract.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  stripKey,
  tabDomId,
  tabHelp,
  tabName,
  TabStrip,
  type TabMarker,
  type TabStripProps,
  type TabView,
} from './TabStrip';

const noop = (): undefined => undefined;
const view = (id: string, label: string, marker: TabMarker = 'none'): TabView => ({
  id,
  label,
  marker,
});
const strip = (props: Partial<TabStripProps> = {}): string =>
  renderToStaticMarkup(
    <TabStrip
      tabs={[view('a', 'Untitled')]}
      activeId="a"
      onActivate={noop}
      onClose={noop}
      onNew={noop}
      {...props}
    />,
  );
const several = (): TabView[] => [
  view('a', 'esterification'),
  view('b', 'ethanol'),
  view('c', 'Untitled 2', 'dot'),
  view('d', 'Aspirin synthesis from salicylic acid'),
];
const LONG = 'Aspirin synthesis from salicylic acid';
const tabsOf = (html: string): string[] =>
  [...html.matchAll(/<div[^>]*role="tab"[^>]*>[\s\S]*?<\/button><\/div>/g)].map((m) => m[0]);
const stops = (html: string): (string | undefined)[] =>
  tabsOf(html).map((t) => /<div[^>]*tabindex="(-?\d)"/.exec(t)?.[1]);
const selected = (html: string): boolean[] =>
  tabsOf(html).map((t) => t.includes('aria-selected="true"'));

describe('one tab', () => {
  const html = strip();
  it('is a named tablist with one selected tab and the + button after it', () => {
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Open drawings"');
    expect(tabsOf(html)).toHaveLength(1);
    expect(selected(html)).toEqual([true]);
    expect(html.indexOf('data-testid="tab-add"')).toBeGreaterThan(html.lastIndexOf('role="tab"'));
  });
  it('a tab carries its test id, id, DOM id and accessible name', () => {
    expect(html).toContain('data-testid="tab"');
    expect(html).toContain('data-tab-id="a"');
    expect(html).toContain(`id="${tabDomId('a')}"`);
    expect(html).toContain('aria-label="Untitled"');
  });
  it('shows no marker for an unnamed drawing with nothing drawn', () => {
    expect(html).not.toContain('tab-dot');
    expect(html).not.toContain('tab-warn');
  });
});

describe('several tabs', () => {
  it('renders every tab in order, one selected', () => {
    const html = strip({ tabs: several(), activeId: 'a' });
    expect(tabsOf(html).map((t) => /data-tab-id="(\w)"/.exec(t)?.[1])).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(selected(html)).toEqual([true, false, false, false]);
  });
  it('the active id decides the selected tab', () => {
    expect(selected(strip({ tabs: several(), activeId: 'c' }))).toEqual([
      false,
      false,
      true,
      false,
    ]);
  });
  it('exactly one tab stop: the active tab has tabindex 0, the others -1', () => {
    expect(stops(strip({ tabs: several(), activeId: 'a' }))).toEqual(['0', '-1', '-1', '-1']);
    expect(stops(strip({ tabs: several(), activeId: 'b' }))).toEqual(['-1', '0', '-1', '-1']);
    expect(stops(strip({ tabs: several(), activeId: 'd' }))).toEqual(['-1', '-1', '-1', '0']);
  });
  it('an unknown active id selects nothing but still leaves one tab stop (the first tab)', () => {
    const html = strip({ tabs: several(), activeId: 'zzz' });
    expect(stops(html)).toEqual(['0', '-1', '-1', '-1']);
    expect(selected(html)).toEqual([false, false, false, false]);
  });
});

describe('markers (T6) and accessible names (T16)', () => {
  const states: [TabMarker, string, string][] = [
    ['none', 'ethanol', 'ethanol'],
    ['dot', 'Untitled 2', 'Untitled 2, not saved as a file yet'],
    ['unavailable', 'ethanol', "ethanol, couldn't save"],
    ['unkept', 'Untitled 3', "Untitled 3, couldn't save"],
  ];
  for (const [marker, label, name] of states) {
    it(`${marker}: name "${name}"`, () => {
      expect(tabName(view('x', label, marker))).toBe(name);
      const html = strip({ tabs: [view('x', label, marker)], activeId: 'x' });
      expect(html).toContain(`aria-label="${name.replace("'", '&#x27;')}"`);
      expect(html).toContain(`data-marker="${marker}"`);
    });
  }
  it('the dot is one aria-hidden span before the label', () => {
    const html = strip({ tabs: [view('x', 'Untitled 2', 'dot')], activeId: 'x' });
    expect(html).toContain(
      '<span class="tab-dot" aria-hidden="true"></span><span class="tab-title">',
    );
    expect(html).not.toContain('tab-warn');
  });
  for (const marker of ['unavailable', 'unkept'] as const) {
    it(`${marker}: the warning icon replaces the dot, aria-hidden`, () => {
      const html = strip({ tabs: [view('x', 'ethanol', marker)], activeId: 'x' });
      expect(html).toContain(
        '<span class="tab-warn" aria-hidden="true"><svg class="icon icon-16" aria-hidden="true"><use href="#warning"></use></svg></span><span class="tab-title">',
      );
      expect(html).not.toContain('tab-dot');
    });
  }
});

describe('tooltips (T5)', () => {
  it('the three help texts and the default switching hint', () => {
    expect(tabHelp(view('a', 'x'))).toBe('Switch tabs with Ctrl+Tab and Ctrl+Shift+Tab.');
    expect(tabHelp(view('a', 'x', 'dot'))).toBe(
      'Not saved as a file yet. Chalkbond keeps it for you. Press Ctrl+S to save it.',
    );
    expect(tabHelp(view('a', 'x', 'unavailable'))).toBe(
      "Couldn't save this file. Check that its folder is still there, or use Save as.",
    );
    expect(tabHelp(view('a', 'x', 'unkept'))).toBe(
      "Chalkbond couldn't keep this drawing. Free some disk space, or save it with Save as.",
    );
  });
  it('a tab carries its full label as the tooltip title, its help text and the side', () => {
    const html = strip({ tabs: [view('x', LONG)], activeId: 'x' });
    expect(html).toContain(`data-ui-tip="${LONG}"`);
    expect(html).toContain('data-ui-tip-help="Switch tabs with Ctrl+Tab and Ctrl+Shift+Tab."');
    expect(html).toContain('data-ui-tip-side="below"');
  });
  it('the label cell is the ellipsis class and holds the whole label', () => {
    expect(strip({ tabs: [view('x', LONG)], activeId: 'x' })).toContain(
      `<span class="tab-title">${LONG}</span>`,
    );
  });
  it('the cross and the + button have their own tooltips', () => {
    const html = strip();
    expect(html).toContain('data-ui-tip="Close tab" data-ui-tip-key="Ctrl+W"');
    expect(html).toContain('data-ui-tip="New tab" data-ui-tip-key="Ctrl+T"');
  });
  it('the app tooltip does not use the editor host attributes (no double tooltip)', () => {
    expect(strip({ tabs: several() })).not.toMatch(/ data-tip[= -]/);
  });
  it('user text lands only in text nodes and attribute values, escaped', () => {
    const html = strip({ tabs: [view('x', '<b>"&')], activeId: 'x' });
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;&quot;&amp;');
  });
});

describe('the cross and the + button', () => {
  it('the cross is named with the label and its key, and is not a tab stop', () => {
    const html = strip({ tabs: several(), activeId: 'a' });
    expect(html).toContain('aria-label="Close Untitled 2 (Ctrl+W)"');
    expect(html).toContain(`aria-label="Close ${LONG} (Ctrl+W)"`);
    const buttons = [...html.matchAll(/<button[^>]*class="tab-close"[^>]*>/g)].map((m) => m[0]);
    expect(buttons).toHaveLength(4);
    for (const b of buttons) {
      expect(b).toContain('tabindex="-1"');
      expect(b).toContain('type="button"');
      expect(b).toContain('data-testid="tab-close"');
    }
  });
  it('every tab keeps a cross (its room is always kept); CSS only hides it', () => {
    expect(tabsOf(strip({ tabs: several() })).every((t) => t.includes('tab-close'))).toBe(true);
  });
  it('the + button is a named button after the tab list', () => {
    const html = strip();
    const button = /<button[^>]*data-testid="tab-add"[^>]*>/.exec(html)?.[0] ?? '';
    expect(button).toContain('aria-label="New tab (Ctrl+T)"');
    expect(button).toContain('type="button"');
    expect(button).toContain('class="btn tab-add"');
    expect(html).toContain('<use href="#add"></use>');
    expect(html.indexOf('tab-add')).toBeGreaterThan(html.indexOf('</div></div>'));
  });
  it('the cross uses the close icon at 16 px', () => {
    expect(strip()).toContain(
      '<svg class="icon icon-16" aria-hidden="true"><use href="#close"></use></svg>',
    );
  });
});

describe('keyboard table (T16)', () => {
  it('ArrowRight and ArrowLeft move focus, wrapping', () => {
    expect(stripKey('ArrowRight', 0, 4)).toEqual({ focus: 1 });
    expect(stripKey('ArrowRight', 3, 4)).toEqual({ focus: 0 });
    expect(stripKey('ArrowLeft', 2, 4)).toEqual({ focus: 1 });
    expect(stripKey('ArrowLeft', 0, 4)).toEqual({ focus: 3 });
  });
  it('Home and End go to the ends', () => {
    expect(stripKey('Home', 2, 4)).toEqual({ focus: 0 });
    expect(stripKey('End', 1, 4)).toEqual({ focus: 3 });
  });
  it('Enter and Space activate the focused tab; arrows never activate', () => {
    expect(stripKey('Enter', 2, 4)).toEqual({ activate: true });
    expect(stripKey(' ', 2, 4)).toEqual({ activate: true });
    for (const k of ['ArrowRight', 'ArrowLeft', 'Home', 'End'])
      expect(stripKey(k, 1, 4)).not.toHaveProperty('activate');
  });
  it('one tab wraps onto itself; other keys and an empty strip do nothing', () => {
    expect(stripKey('ArrowRight', 0, 1)).toEqual({ focus: 0 });
    expect(stripKey('ArrowLeft', 0, 1)).toEqual({ focus: 0 });
    expect(stripKey('a', 0, 4)).toBeNull();
    expect(stripKey('ArrowDown', 0, 4)).toBeNull();
    expect(stripKey('Tab', 0, 4)).toBeNull();
    expect(stripKey('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('the tab panel link', () => {
  it('tabDomId is stable and distinct per tab', () => {
    expect(tabDomId('a')).toBe(tabDomId('a'));
    expect(tabDomId('a')).not.toBe(tabDomId('b'));
  });
});
