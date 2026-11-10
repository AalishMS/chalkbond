import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { OverlayGroup } from '../model/overlay';
import { Overlay } from './Overlay';

const size = { w: 800, h: 600 };
const render = (groups: readonly OverlayGroup[]): string =>
  renderToStaticMarkup(<Overlay size={size} groups={groups} />);

describe('Overlay markup', () => {
  it('is an empty screen-px svg without groups', () => {
    const html = render([]);
    expect(html).toContain('data-testid="overlay"');
    expect(html).toContain('viewBox="0 0 800 600"');
    expect(html).not.toContain('<g');
  });

  it('draws a hover circle with its radius inside one hover group', () => {
    const html = render([
      { kind: 'hover', shapes: [{ kind: 'circle', c: { x: 10.123, y: 20 }, r: 9 }] },
    ]);
    expect(html).toContain('<g class="overlay-hover" data-testid="overlay-hover">');
    expect(html).toContain('<circle cx="10.12" cy="20" r="9"></circle>');
  });

  it('draws a straight band, a curved band and a box', () => {
    const html = render([
      {
        kind: 'hover',
        shapes: [
          { kind: 'band', from: { x: 1, y: 2 }, to: { x: 3, y: 4 }, width: 8 },
          {
            kind: 'band',
            from: { x: 1, y: 2 },
            to: { x: 3, y: 4 },
            control: { x: 5, y: 6 },
            width: 8,
          },
          { kind: 'box', rect: { x: 1, y: 2, w: 30, h: 40 }, radius: 4 },
        ],
      },
    ]);
    expect(html).toContain('<path class="overlay-band" d="M1 2L3 4" stroke-width="8"></path>');
    expect(html).toContain('d="M1 2Q5 6 3 4"');
    expect(html).toContain('<rect x="1" y="2" width="30" height="40" rx="4"></rect>');
  });
});
