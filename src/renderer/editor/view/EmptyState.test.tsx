import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState markup', () => {
  const html = renderToStaticMarkup(<EmptyState dispatch={() => undefined} />);

  it('shows the Decision 13 sentence', () => {
    expect(html).toContain('Type a compound name above, or click anywhere to start drawing.');
  });

  it('shows Try: and the three chips in order', () => {
    expect(html).toContain('<span>Try:</span>');
    const chips = [...html.matchAll(/class="chip"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(chips).toEqual([
      'ethanol',
      'benzene',
      'ethanol + acetic acid -&gt; ethyl acetate + water',
    ]);
  });

  it('hides the benzene outline from assistive tech', () => {
    expect(html).toContain('class="empty-art" viewBox="0 0 24 24" aria-hidden="true"');
  });
});
