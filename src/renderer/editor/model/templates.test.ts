import { describe, expect, it } from 'vitest';
import { distance } from './geometry';
import { circumradius, RING_IDS, ringTemplate } from './templates';

describe('ring templates (SPEC-editor.md "Ring templates")', () => {
  it('there are five, in the option order of Decision 2', () => {
    expect([...RING_IDS]).toEqual([
      'benzene',
      'cyclohexane',
      'cyclopentane',
      'cyclobutane',
      'cyclopropane',
    ]);
  });

  it.each(RING_IDS.map((id) => [id] as const))(
    '%s: every bond 1.0, centred on the origin',
    (id) => {
      const t = ringTemplate(id);
      expect(t.vertices).toHaveLength(t.n);
      for (let i = 0; i < t.n; i++) {
        const a = t.vertices[i] as { x: number; y: number };
        const b = t.vertices[(i + 1) % t.n] as { x: number; y: number };
        expect(Math.abs(distance(a, b) - 1)).toBeLessThan(1e-9);
        expect(Math.abs(distance(a, { x: 0, y: 0 }) - circumradius(t.n))).toBeLessThan(1e-9);
      }
      const cx = t.vertices.reduce((s, p) => s + p.x, 0) / t.n;
      const cy = t.vertices.reduce((s, p) => s + p.y, 0) / t.n;
      expect(Math.abs(cx)).toBeLessThan(1e-9);
      expect(Math.abs(cy)).toBeLessThan(1e-9);
    },
  );

  it('only benzene is aromatic (all 1.5, drawn with a circle)', () => {
    expect(RING_IDS.filter((id) => ringTemplate(id).aromatic)).toEqual(['benzene']);
    expect(ringTemplate('benzene').n).toBe(6);
  });

  it('vertex up for 3, 5 and 6; the square is axis-aligned', () => {
    for (const id of ['benzene', 'cyclohexane', 'cyclopentane', 'cyclopropane'] as const) {
      const top = ringTemplate(id).vertices.reduce((m, p) => (p.y < m.y ? p : m));
      expect(Math.abs(top.x)).toBeLessThan(1e-9);
      expect(top.y).toBeLessThan(0);
    }
    const square = ringTemplate('cyclobutane').vertices;
    for (const p of square) {
      expect(Math.abs(Math.abs(p.x) - 0.5)).toBeLessThan(1e-9);
      expect(Math.abs(Math.abs(p.y) - 0.5)).toBeLessThan(1e-9);
    }
  });
});
