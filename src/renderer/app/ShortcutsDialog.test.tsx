// A12 markup (SPEC-app-shell.md "Keyboard shortcuts dialog"): the dialog shell, headings in
// order, key chips joined by a muted "+", the fixed Close footer.
import { renderToStaticMarkup as render } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SHORTCUTS } from './model/shortcuts';
import { ShortcutsDialog } from './ShortcutsDialog';

const html = render(<ShortcutsDialog onClose={() => undefined} />);
const between = (from: string, to: string): string =>
  html.slice(html.indexOf(from), html.indexOf(to, html.indexOf(from)));

describe('ShortcutsDialog markup', () => {
  it('is a 560-wide modal dialog named "Keyboard shortcuts" with its test id', () => {
    expect(html).toContain('data-testid="shortcuts-dialog"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/class="dialog dialog-md shortcuts"/);
    expect(html).toMatch(/<h2 id="([^"]+)" class="dialog-title">Keyboard shortcuts<\/h2>/);
    const id = /<h2 id="([^"]+)"/.exec(html)?.[1];
    expect(html).toContain(`aria-labelledby="${id}"`);
  });

  it('lists the eight section headings in order, one h3 each', () => {
    const headings = [...html.matchAll(/<h3 class="sc-section">([^<]+)<\/h3>/g)].map((m) => m[1]);
    expect(headings).toEqual(SHORTCUTS.map((s) => s.section));
  });

  it('one row per shortcut with its meaning', () => {
    const rows = [...html.matchAll(/<div class="sc-row">/g)];
    expect(rows).toHaveLength(SHORTCUTS.reduce((n, s) => n + s.rows.length, 0));
    for (const section of SHORTCUTS)
      for (const row of section.rows)
        expect(html).toContain(
          `<span class="sc-meaning">${row.meaning.replace('&', '&amp;')}</span>`,
        );
  });

  it('a combination is one chip per key joined by a muted, hidden "+"', () => {
    const plus = '<span aria-hidden="true">+</span>';
    expect(html).toContain(
      `<span class="keys"><kbd class="key">Ctrl</kbd>${plus}<kbd class="key">Shift</kbd>${plus}<kbd class="key">L</kbd></span><span class="sc-meaning">Clean up</span>`,
    );
    expect(html).toContain(
      `<span class="keys"><kbd class="key">Space</kbd>${plus}<span>drag</span></span>`,
    );
    // Alternatives side by side: C H N O S P F I are eight chips in one key cell.
    expect(html).toContain(
      `<span class="keys">${['C', 'H', 'N', 'O', 'S', 'P', 'F', 'I'].map((k) => `<kbd class="key">${k}</kbd>`).join('')}</span><span class="sc-meaning">Change it to that element</span>`,
    );
    // A lone + is a key, not a joiner.
    expect(html).toContain(
      '<span class="keys"><kbd class="key">8</kbd><kbd class="key">+</kbd></span><span class="sc-meaning">Plus</span>',
    );
    // R27: a tool row shows the digit, then the letter.
    expect(html).toContain(
      '<span class="keys"><kbd class="key">1</kbd><kbd class="key">V</kbd></span><span class="sc-meaning">Select</span>',
    );
  });

  it('the body scrolls; the footer holds one secondary Close button', () => {
    expect(html).toContain('<div class="dialog-body">');
    const foot = between('<div class="dialog-foot">', '</div></div>');
    expect([...foot.matchAll(/<button/g)]).toHaveLength(1);
    expect(foot).toContain('btn-secondary');
    expect(foot).toContain('data-testid="shortcuts-close"');
    expect(foot).toContain('>Close</button>');
  });
});
