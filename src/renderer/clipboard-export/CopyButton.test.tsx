// Markup of the Copy button (SPEC-clipboard-export.md "Copy button").
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CopyButton, type CopyDisabledReason } from './CopyButton';

const html = (
  props: Partial<{ copied: boolean; compact: boolean; reason: CopyDisabledReason | null }> = {},
): string =>
  renderToStaticMarkup(
    <CopyButton
      copied={props.copied ?? false}
      compact={props.compact ?? false}
      reason={props.reason ?? null}
      onCopy={() => {}}
    />,
  );
/** The root element's attributes, its text and its icon `href`s (markup only: no DOM in node). */
const doc = (markup: string) => {
  const open = /^<button([^>]*)>/.exec(markup)?.[1] ?? '';
  const attrs = new Map([...open.matchAll(/ ([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  return {
    attr: (name: string) => attrs.get(name) ?? null,
    text: markup.replace(/<[^>]*>/g, ''),
    icons: [...markup.matchAll(/<use href="([^"]*)"/g)].map((m) => m[1]),
    labelHidden: /<span aria-hidden="true">[^<]*<\/span>/.test(markup),
  };
};
const HELP = 'Copies the selection, or the whole drawing, to paste into PowerPoint or Word.';

describe('CopyButton', () => {
  it('at rest: copy icon, label "Copy", the accessible name and the editor tooltip attributes', () => {
    const b = doc(html());
    expect(b.attr('type')).toBe('button');
    expect(b.attr('data-testid')).toBe('copy');
    expect(b.attr('class')).toBe('btn-copy');
    expect(b.attr('aria-label')).toBe('Copy (Ctrl+C)');
    expect(b.attr('aria-disabled')).toBe('false');
    expect(b.attr('disabled')).toBeNull();
    expect(b.attr('data-tip')).toBe('Copy');
    expect(b.attr('data-tip-key')).toBe('Ctrl+C');
    expect(b.attr('data-tip-help')).toBe(HELP);
    expect(b.icons).toEqual(['#copy']);
    expect(b.labelHidden).toBe(true);
    expect(b.text).toBe('Copy');
  });

  it('copied: check icon and "Copied", same name', () => {
    const b = doc(html({ copied: true }));
    expect(b.icons).toEqual(['#check']);
    expect(b.text).toBe('Copied');
    expect(b.attr('aria-label')).toBe('Copy (Ctrl+C)');
  });

  it('compact (below 1100 px): label only, never icon-only, also when copied', () => {
    const rest = doc(html({ compact: true }));
    expect(rest.icons).toEqual([]);
    expect(rest.text).toBe('Copy');
    expect(rest.attr('class')).toBe('btn-copy is-compact');
    const copied = doc(html({ compact: true, copied: true }));
    expect(copied.icons).toEqual([]);
    expect(copied.text).toBe('Copied');
  });

  it.each([
    ['empty', 'Draw something first.'],
    ['typing', 'Press Enter to finish typing first.'],
    ['busy', HELP],
  ] as const)(
    'disabled (%s) stays focusable with aria-disabled and the reason as help',
    (r, help) => {
      const b = doc(html({ reason: r }));
      expect(b.attr('aria-disabled')).toBe('true');
      expect(b.attr('disabled')).toBeNull();
      expect(b.attr('tabindex')).toBeNull();
      expect(b.attr('data-tip-help')).toBe(help);
      expect(b.attr('data-tip')).toBe('Copy');
      expect(b.text).toBe('Copy');
    },
  );
});
