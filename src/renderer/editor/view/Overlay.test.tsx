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

  it('draws the chain count as text at its point', () => {
    const html = render([
      { kind: 'count', shapes: [{ kind: 'text', at: { x: 10.126, y: 20 }, text: '4' }] },
    ]);
    expect(html).toContain('<g class="overlay-count" data-testid="overlay-count">');
    expect(html).toContain('<text x="10.13" y="20">4</text>');
  });

  it('draws a guide line, a square frame and a selection group per kind', () => {
    const html = render([
      { kind: 'selection', shapes: [{ kind: 'circle', c: { x: 1, y: 2 }, r: 12 }] },
      {
        kind: 'frame',
        shapes: [{ kind: 'box', rect: { x: 0.5, y: 0.5, w: 10, h: 10 }, radius: 0 }],
      },
      { kind: 'guide', shapes: [{ kind: 'line', from: { x: 5, y: 0 }, to: { x: 5, y: 600 } }] },
    ]);
    expect(html).toContain('<g class="overlay-selection" data-testid="overlay-selection">');
    expect(html).toContain('<g class="overlay-frame" data-testid="overlay-frame">');
    expect(html).toContain('<rect x="0.5" y="0.5" width="10" height="10" rx="0"></rect>');
    expect(html).toContain('<g class="overlay-guide" data-testid="overlay-guide">');
    expect(html).toContain('<line x1="5" y1="0" x2="5" y2="600"></line>');
  });

  it('draws a handle group: stem, circle, square and a diamond', () => {
    const html = render([
      {
        kind: 'handle',
        shapes: [
          { kind: 'line', from: { x: 5.5, y: 20.5 }, to: { x: 5.5, y: 1.5 } },
          { kind: 'circle', c: { x: 5.5, y: -3.5 }, r: 5 },
          { kind: 'diamond', c: { x: 20, y: 30 }, size: 9 },
        ],
      },
    ]);
    expect(html).toContain('<g class="overlay-handle" data-testid="overlay-handle">');
    expect(html).toContain('<circle cx="5.5" cy="-3.5" r="5"></circle>');
    // A 9 px diamond: a square of side 9 turned 45 degrees has a half-diagonal of 9 / sqrt(2).
    expect(html).toContain('<polygon points="20,23.64 26.36,30 20,36.36 13.64,30"></polygon>');
  });
});
