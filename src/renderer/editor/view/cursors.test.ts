import { describe, expect, it } from 'vitest';
import { cssCursor } from './cursors';

describe('cssCursor', () => {
  it('passes plain cursors through', () => {
    expect(cssCursor('crosshair')).toBe('crosshair');
    expect(cssCursor('move')).toBe('move');
  });

  it('builds the erase cursor from the icon: 20 px, hotspot 4,18, crosshair fallback', () => {
    const value = cssCursor('erase');
    expect(value).toMatch(/^url\("data:image\/svg\+xml,[^"]+"\) 4 18, crosshair$/);
    const svg = decodeURIComponent(/data:image\/svg\+xml,([^"]+)"/.exec(value)?.[1] ?? '');
    expect(svg).toContain('width="20" height="20" viewBox="0 0 24 24"');
    expect(svg).toContain('M4.5 15.5L13.5 6.5Q15 5 16.5 6.5L19.5 9.5Q21 11 19.5 12.5L12 20H7.5Z');
    expect(svg).not.toContain('currentColor');
  });
});
