// Markup of the Export dialog (SPEC-clipboard-export.md "Export dialog"; mock-ups A08a–c).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExportDialog } from './ExportDialog';
import type { ExportChoices } from './model/export-flow';

const SIZE = { width: 720, height: 72 };
const html = (
  choices: Partial<ExportChoices> = {},
  outcome: 'A' | 'B' = 'A',
  size = SIZE,
): string =>
  renderToStaticMarkup(
    <ExportDialog
      state={{ choices: { format: 'png', pngDpi: 300, pngWhite: false, ...choices }, size }}
      pdfOutcome={outcome}
      onChoose={() => {}}
      onCancel={() => {}}
      onSave={() => {}}
    />,
  );
/** Visible text: tags dropped, the entities React escapes decoded. */
const text = (markup: string): string =>
  markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
/** The opening tag of the element with `data-testid`. */
const tag = (markup: string, id: string): string =>
  new RegExp(`<[a-z]+[^>]*data-testid="${id}"[^>]*>`).exec(markup)?.[0] ?? '';
/** The text inside the element with `data-testid` (no nested elements of the same tag). */
const inner = (markup: string, id: string): string => {
  const m = new RegExp(`<([a-z]+)[^>]*data-testid="${id}"[^>]*>([\\s\\S]*?)</\\1>`).exec(markup);
  return text(m?.[2] ?? '').trim();
};

describe('ExportDialog', () => {
  it('the shell: dialog role, modal, labelled by the title "Export drawing"', () => {
    const m = html();
    const dialog = tag(m, 'export-dialog');
    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain('aria-modal="true"');
    const labelled = /aria-labelledby="([^"]+)"/.exec(dialog)?.[1];
    expect(m).toContain(`id="${labelled}"`);
    expect(m).toMatch(new RegExp(`<h2[^>]*id="${labelled}"[^>]*>Export drawing</h2>`));
    expect(dialog).toMatch(/class="[^"]*dialog-sm/);
  });

  it('three format cards with the A08 titles and descriptions, one radio group "Format"', () => {
    const m = html();
    expect(m).toMatch(/role="radiogroup" aria-label="Format"/);
    expect(inner(m, 'export-format-png')).toBe('PNG picture For WhatsApp, websites and printing.');
    expect(inner(m, 'export-format-svg')).toBe(
      'SVG drawing Stays sharp at any size in PowerPoint and Word.',
    );
    expect(inner(m, 'export-format-pdf')).toBe(
      'PDF document For printing or sending as a document.',
    );
    for (const f of ['png', 'svg', 'pdf']) {
      const card = tag(m, `export-format-${f}`);
      expect(card).toContain('role="radio"');
      expect(card).toContain(`aria-checked="${f === 'png'}"`);
      expect(card).toContain(`tabindex="${f === 'png' ? 0 : -1}"`);
    }
  });

  it('the selected card is the one tab stop', () => {
    const m = html({ format: 'svg' });
    expect(tag(m, 'export-format-svg')).toContain('aria-checked="true"');
    expect(tag(m, 'export-format-svg')).toContain('tabindex="0"');
    expect(tag(m, 'export-format-png')).toContain('tabindex="-1"');
  });

  it('PNG block: Size (Screen, Print, Poster), the live size line, White background', () => {
    const m = html();
    expect(m).toMatch(/role="radiogroup" aria-label="Picture size"/);
    expect(m).toContain('>Size</p>');
    expect(inner(m, 'export-size-screen')).toBe('Screen');
    expect(inner(m, 'export-size-print')).toBe('Print');
    expect(inner(m, 'export-size-poster')).toBe('Poster');
    expect(tag(m, 'export-size-print')).toContain('aria-checked="true"');
    expect(inner(m, 'export-size-line')).toBe('Sharp on paper. 3,000 × 300 pixels.');
    const white = tag(m, 'export-white');
    expect(white).toContain('role="checkbox"');
    expect(white).toContain('aria-checked="false"');
    expect(inner(m, 'export-white')).toBe(
      'White background Leave this off for slides with a coloured background.',
    );
  });

  it('size line per size, and the reduced form', () => {
    expect(inner(html({ pngDpi: 150 }), 'export-size-line')).toBe(
      'For messages and websites. 1,500 × 150 pixels.',
    );
    expect(inner(html({ pngDpi: 600 }), 'export-size-line')).toBe(
      'For large prints. 6,000 × 600 pixels.',
    );
    expect(inner(html({ pngDpi: 600 }, 'A', { width: 7200, height: 72 }), 'export-size-line')).toBe(
      'For large prints. 10,000 × 100 pixels (less sharp: the drawing is very large).',
    );
    expect(tag(html({ pngWhite: true }), 'export-white')).toContain('aria-checked="true"');
  });

  it('no PNG block for SVG and PDF', () => {
    for (const format of ['svg', 'pdf'] as const) {
      const m = html({ format });
      expect(m).not.toContain('export-size-');
      expect(m).not.toContain('export-white');
      expect(m).not.toContain('Picture size');
    }
  });

  it('reopen line with the info icon: per format and PDF outcome', () => {
    const promise = 'You can open this file in Chalkbond again to change the drawing.';
    for (const [format, outcome] of [
      ['png', 'A'],
      ['svg', 'A'],
      ['pdf', 'A'],
      ['png', 'B'],
      ['svg', 'B'],
    ] as const) {
      const m = html({ format }, outcome);
      expect(inner(m, 'export-reopen')).toBe(promise);
      expect(tag(m, 'export-reopen')).not.toContain('is-warning');
    }
    const b = html({ format: 'pdf' }, 'B');
    expect(inner(b, 'export-reopen')).toBe(
      "PDF files can't be opened in Chalkbond again. Keep the drawing as a .chalk file too.",
    );
    expect(tag(b, 'export-reopen')).toMatch(/class="[^"]*is-warning/);
    expect(b).toMatch(/data-testid="export-reopen"[^>]*>\s*<svg[^>]*><use href="#info"/);
  });

  it('footer: Cancel (secondary) then Save… (primary)', () => {
    const m = html();
    expect(tag(m, 'export-cancel')).toMatch(/btn-secondary/);
    expect(tag(m, 'export-save')).toMatch(/btn-primary/);
    expect(inner(m, 'export-cancel')).toBe('Cancel');
    expect(inner(m, 'export-save')).toBe('Save…');
    expect(m.indexOf('export-cancel')).toBeLessThan(m.indexOf('export-save'));
  });

  it('never shows "dpi" in any state', () => {
    for (const format of ['png', 'svg', 'pdf'] as const)
      for (const pngDpi of [150, 300, 600] as const)
        for (const outcome of ['A', 'B'] as const)
          expect(text(html({ format, pngDpi }, outcome))).not.toMatch(/dpi/i);
  });

  it('never mentions the selection: Export is the whole drawing', () => {
    expect(text(html())).not.toMatch(/selection|selected/i);
  });
});
