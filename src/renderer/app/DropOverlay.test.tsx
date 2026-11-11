// A13 drop overlay markup (SPEC-app-shell.md "Drop overlay"): test id, aria-hidden, both lines,
// the .pdf of PDF-A in the second.
import { renderToStaticMarkup as render } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DropOverlay } from './DropOverlay';

describe('DropOverlay markup', () => {
  it('is hidden from assistive technology and carries its test id', () => {
    const html = render(<DropOverlay />);
    expect(html).toMatch(/^<div class="drop" data-testid="drop-overlay" aria-hidden="true">/);
    expect(html).toContain('<div class="drop-box">');
  });

  it('"Drop to open", then the second line listing .chalk, .png, .svg and .pdf (PDF-A)', () => {
    const html = render(<DropOverlay />);
    expect(html).toContain('<p class="drop-title">Drop to open</p>');
    expect(html).toContain(
      '<p class="drop-sub">Chalkbond drawings (.chalk) and pictures made in Chalkbond (.png, .svg, .pdf)</p>',
    );
    expect(html.indexOf('drop-title')).toBeLessThan(html.indexOf('drop-sub'));
  });
});
