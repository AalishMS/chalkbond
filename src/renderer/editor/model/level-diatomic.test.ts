import { createNameIndex, structureFromText } from '@core/chem-core';
import type { SubDoc } from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import compounds from '../../../../resources/compounds/compounds.json';
import { levelDiatomic } from './level-diatomic';

const names = createNameIndex(compounds);
function sub(text: string): SubDoc {
  const r = structureFromText(text, names);
  if (!r.ok) throw new Error(text);
  return r.value.sub;
}

describe('levelDiatomic (N2, N3)', () => {
  for (const text of ['H2', 'O2', 'chlorine']) {
    it(`lays ${text} flat, first atom on the left, bond length and centre kept`, () => {
      const before = sub(text);
      const [a0, b0] = Object.values(before.atoms);
      if (a0 === undefined || b0 === undefined) throw new Error('not two atoms');
      expect(Object.values(before.atoms)).toHaveLength(2);
      const after = levelDiatomic(before);
      const [a1, b1] = Object.values(after.atoms);
      if (a1 === undefined || b1 === undefined) throw new Error('not two atoms');
      expect(a1.y).toBeCloseTo(b1.y, 12);
      expect(a1.x).toBeLessThan(b1.x);
      expect(a1.element).toBe(a0.element);
      expect(b1.x - a1.x).toBeCloseTo(Math.hypot(b0.x - a0.x, b0.y - a0.y), 9);
      expect((a1.x + b1.x) / 2).toBeCloseTo((a0.x + b0.x) / 2, 9);
      expect((a1.y + b1.y) / 2).toBeCloseTo((a0.y + b0.y) / 2, 9);
      expect(after.bonds).toEqual(before.bonds);
    });
  }

  it('leaves fragments with another atom count as they are', () => {
    for (const text of ['water', 'ethanol', 'benzene', 'methane']) {
      const s = sub(text);
      expect(levelDiatomic(s)).toBe(s);
    }
  });
});
