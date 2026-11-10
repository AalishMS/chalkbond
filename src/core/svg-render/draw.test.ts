import { describe, expect, it } from 'vitest';
import { normRect, pathD, polygonEl, strokeEl } from './draw';
import { resolveStyle } from './style';

const style = resolveStyle({ preset: 'slides', overrides: {} });

describe('draw helpers', () => {
  it('pathD writes commands and rounded numbers', () => {
    expect(
      pathD(
        [
          { x: 0, y: 0 },
          { x: 1.23456, y: -2 },
        ],
        ['M', 'L'],
      ),
    ).toBe('M0 0L1.235 -2');
  });

  it('pathD defaults the command to L', () => {
    expect(
      pathD([
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ]),
    ).toBe('L1 2L3 4');
  });

  it('strokeEl is a path stroked at the line width', () => {
    expect(strokeEl('M0 0L1 1', '#ff0000', style)).toBe(
      '<path d="M0 0L1 1" stroke="#ff0000" stroke-width="2"/>',
    );
  });

  it('polygonEl is a filled polygon with no stroke', () => {
    expect(
      polygonEl(
        [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 0, y: 3 },
        ],
        '#000000',
      ),
    ).toBe('<polygon points="0,0 4,0 0,3" fill="#000000" stroke="none"/>');
  });

  it('normRect makes width and height non-negative, moving the origin', () => {
    expect(normRect({ x: 10, y: 10, w: -4, h: 5 })).toEqual({ x: 6, y: 10, w: 4, h: 5 });
    expect(normRect({ x: 1, y: 2, w: 3, h: -4 })).toEqual({ x: 1, y: -2, w: 3, h: 4 });
  });
});
