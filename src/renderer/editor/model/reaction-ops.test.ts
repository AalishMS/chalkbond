import {
  fragments,
  resolveAnchor,
  type Anchor,
  type ArrowObject,
  type AtomId,
  type Bond,
  type CurvedArrowObject,
  type Doc,
  type ObjectId,
} from '@core/doc-model';
import { describe, expect, it } from 'vitest';
import { drawn } from '../state/testing';
import { angleDeg, distance, type Point } from './geometry';
import {
  ARROW_DEFAULT_BLU,
  CURVE_BEND,
  addArrow,
  addCurved,
  addPlus,
  arrowFromDrag,
  arrowKindOf,
  curvedBend,
  curvedHeadOf,
  defaultArrowEnds,
  defaultBendSize,
  setArrowKind,
} from './reaction-ops';

const only = <T>(doc: Doc, type: string): T => {
  const found = Object.values(doc.objects).filter((o) => o.type === type);
  expect(found).toHaveLength(1);
  return found[0] as T;
};

const rad = (deg: number): number => (deg * Math.PI) / 180;

describe('options', () => {
  it('maps the four arrow options to the four kinds of Decision 3', () => {
    expect(arrowKindOf('forward')).toBe('forward');
    expect(arrowKindOf('equilibrium')).toBe('equilibrium');
    expect(arrowKindOf('resonance')).toBe('resonance');
    expect(arrowKindOf('nogo')).toBe('no-go');
    expect(arrowKindOf('no-go')).toBe('no-go');
    expect(arrowKindOf('???')).toBe('forward');
  });
  it('maps the two curly options to heads', () => {
    expect(curvedHeadOf('full')).toBe('full');
    expect(curvedHeadOf('fishhook')).toBe('fishhook');
    expect(curvedHeadOf('')).toBe('full');
  });
});

describe('arrowFromDrag (R1)', () => {
  const o = { x: 1, y: 1 };
  const toward = (deg: number, len = 3): Point => ({
    x: 1 + len * Math.cos(rad(deg)),
    y: 1 + len * Math.sin(rad(deg)),
  });
  const angleOf = (a: { from: Point; to: Point } | null): number =>
    a === null ? NaN : angleDeg(a.from, a.to);

  it('a rightward drag keeps its length', () => {
    expect(arrowFromDrag(o, { x: 4, y: 1 }, false)).toEqual({ from: o, to: { x: 4, y: 1 } });
  });
  it('a drag 7 degrees off horizontal snaps to 0', () => {
    const a = arrowFromDrag(o, toward(7), false);
    expect(angleOf(a)).toBeCloseTo(0, 9);
    expect(a === null ? NaN : distance(a.from, a.to)).toBeCloseTo(3, 9);
  });
  it('a drag 10 degrees off horizontal snaps to 15 (the todo example)', () => {
    expect(angleOf(arrowFromDrag(o, toward(10), false))).toBeCloseTo(15, 9);
  });
  it('a drag 20 degrees off horizontal snaps to 15', () => {
    expect(angleOf(arrowFromDrag(o, toward(20), false))).toBeCloseTo(15, 9);
  });
  it('Shift leaves the angle free', () => {
    expect(angleOf(arrowFromDrag(o, toward(20), true))).toBeCloseTo(20, 9);
  });
  it('a drag shorter than 0.5 BLU is a click: null', () => {
    expect(arrowFromDrag(o, { x: 1.3, y: 1 }, false)).toBeNull();
    expect(arrowFromDrag(o, { x: 1.5, y: 1 }, false)).not.toBeNull();
  });
  it('never makes a negative zero', () => {
    const a = arrowFromDrag({ x: 0, y: 0 }, { x: -2, y: 0.01 }, false);
    expect(Object.is(a?.to.y, -0)).toBe(false);
  });
});

describe('addArrow and setArrowKind', () => {
  it('adds an arrow of the kind between the points', () => {
    const [doc, id] = addArrow(
      drawn(),
      { from: { x: 0, y: 0 }, to: { x: 3, y: 0 } },
      'equilibrium',
    );
    expect(doc.objects[id]).toMatchObject({
      type: 'arrow',
      kind: 'equilibrium',
      from: { x: 0, y: 0 },
      to: { x: 3, y: 0 },
    });
  });
  it('the default arrow is 2.5 BLU to the right of the point', () => {
    const [doc, id] = addArrow(drawn(), defaultArrowEnds({ x: 2, y: 1 }), 'forward');
    const a = doc.objects[id] as ArrowObject;
    expect(a.from).toEqual({ x: 2, y: 1 });
    expect(a.to).toEqual({ x: 2 + ARROW_DEFAULT_BLU, y: 1 });
    expect(ARROW_DEFAULT_BLU).toBe(2.5);
  });
  it('sets the kind of an existing arrow; the same kind or a missing arrow is no change', () => {
    const [doc, id] = addArrow(drawn(), defaultArrowEnds({ x: 0, y: 0 }), 'forward');
    const next = setArrowKind(doc, id, 'equilibrium');
    expect((next?.objects[id] as ArrowObject).kind).toBe('equilibrium');
    expect(setArrowKind(doc, id, 'forward')).toBeNull();
    expect(setArrowKind(doc, 'o99' as ObjectId, 'forward')).toBeNull();
  });
});

describe('addPlus', () => {
  it('puts a plus at the point', () => {
    const [doc, id] = addPlus(drawn(), { x: 1.5, y: 2 });
    expect(doc.objects[id]).toMatchObject({ type: 'plus', at: { x: 1.5, y: 2 } });
  });
});

describe('curved arrows (R3)', () => {
  const acetic = (): Doc => drawn({ name: 'acetic acid', x: 0, y: 0 });
  /** The C=O bond and its oxygen. */
  function carbonyl(doc: Doc): { bond: Bond; oxygen: AtomId } {
    for (const b of Object.values(doc.bonds)) {
      if (b.order !== 2) continue;
      const o = [b.a1, b.a2].find((id) => doc.atoms[id]?.element === 'O');
      if (o !== undefined) return { bond: b, oxygen: o };
    }
    throw new Error('no C=O');
  }

  it('a bond anchor is at t = 0.5, an atom anchor the atom; the head is the option', () => {
    const doc = acetic();
    const { bond, oxygen } = carbonyl(doc);
    const edit = addCurved(
      doc,
      { kind: 'bond', bond: bond.id, t: 0.5 },
      { kind: 'atom', atom: oxygen },
      'full',
    );
    if (edit === null) throw new Error('no edit');
    const c = only<CurvedArrowObject>(edit[0], 'curved-arrow');
    expect(c.from).toEqual({ kind: 'bond', bond: bond.id, t: 0.5 });
    expect(c.to).toEqual({ kind: 'atom', atom: oxygen });
    expect(c.head).toBe('full');
    expect(Math.abs(c.bend)).toBeCloseTo(1.8, 9);
    expect(resolveAnchor(edit[0], c.from).x).toBeTypeOf('number');
  });

  it('a point end is kept as a point', () => {
    const doc = acetic();
    const { oxygen } = carbonyl(doc);
    const edit = addCurved(
      doc,
      { kind: 'atom', atom: oxygen },
      { kind: 'point', p: { x: 4, y: 2 } },
      'fishhook',
    );
    const c = only<CurvedArrowObject>(edit?.[0] ?? doc, 'curved-arrow');
    expect(c.to).toEqual({ kind: 'point', p: { x: 4, y: 2 } });
    expect(c.head).toBe('fishhook');
  });

  it('same start and end cancel', () => {
    const doc = acetic();
    const { bond, oxygen } = carbonyl(doc);
    const b = { kind: 'bond', bond: bond.id, t: 0.5 } as const;
    expect(addCurved(doc, b, { ...b }, 'full')).toBeNull();
    const a = { kind: 'atom', atom: oxygen } as const;
    expect(addCurved(doc, a, { ...a }, 'fishhook')).toBeNull();
  });

  /** How much farther the control point is from the centroid than the chord midpoint. */
  function outward(doc: Doc, from: AtomId, to: AtomId): number {
    const a = doc.atoms[from];
    const b = doc.atoms[to];
    if (!a || !b) throw new Error('atom');
    const bend = curvedBend(doc, { kind: 'atom', atom: from }, { kind: 'atom', atom: to });
    const len = distance(a, b);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // svg-render: control = mid + bend * |chord| * (u.y, -u.x).
    const ctl = {
      x: mid.x + ((b.y - a.y) / len) * bend * len,
      y: mid.y - ((b.x - a.x) / len) * bend * len,
    };
    const all = Object.values(doc.atoms);
    const c = {
      x: all.reduce((s, p) => s + p.x, 0) / all.length,
      y: all.reduce((s, p) => s + p.y, 0) / all.length,
    };
    return distance(ctl, c) - distance(mid, c);
  }

  it('the bend bulges away from the centroid, whichever way the arrow points', () => {
    const doc = drawn({ name: 'ethanol', x: 0, y: 0 });
    const [c1, c2, o] = Object.keys(doc.atoms) as AtomId[];
    if (!c1 || !c2 || !o) throw new Error('atoms');
    for (const [a, b] of [
      [c1, c2],
      [c2, c1],
      [c2, o],
      [o, c2],
    ] as const) {
      expect(outward(doc, a, b)).toBeGreaterThan(0);
    }
  });

  it('+0.9 over a one-bond chord when the centroid lies on the chord', () => {
    const doc = drawn({ name: 'ethane', x: 0, y: 0 });
    const [a, b] = Object.keys(doc.atoms) as AtomId[];
    if (!a || !b) throw new Error('atoms');
    expect(curvedBend(doc, { kind: 'atom', atom: a }, { kind: 'atom', atom: b })).toBeCloseTo(
      0.9,
      9,
    );
  });

  it('uses the atoms of both fragments when the anchors touch two', () => {
    const doc = drawn({ name: 'water', x: 0, y: 0 }, { name: 'chloromethane', x: 4, y: 0 });
    const [f1, f2] = fragments(doc);
    const from = f1?.[0];
    const to = f2?.[0];
    if (!from || !to) throw new Error('fragments');
    expect(
      Math.abs(curvedBend(doc, { kind: 'atom', atom: from }, { kind: 'atom', atom: to })),
    ).toBe(CURVE_BEND);
  });

  it('a point end touches only the start fragment', () => {
    const doc = drawn({ name: 'ethanol', x: 0, y: 0 });
    const [a] = Object.keys(doc.atoms) as AtomId[];
    if (!a) throw new Error('atoms');
    const bend = curvedBend(doc, { kind: 'atom', atom: a }, { kind: 'point', p: { x: 5, y: 5 } });
    expect(Math.abs(bend)).toBe(CURVE_BEND);
  });
});

describe('default curved-arrow bend (apex height, R3)', () => {
  it('apex is max(0.2 x chord, 0.45 BLU): bend 1.8 at 0.5, 0.9 at 1, 0.4 at 3', () => {
    expect(defaultBendSize(0.5)).toBeCloseTo(1.8, 9);
    expect(defaultBendSize(1)).toBeCloseTo(0.9, 9);
    expect(defaultBendSize(3)).toBeCloseTo(0.4, 9);
    expect(defaultBendSize(2.25)).toBeCloseTo(0.4, 9);
  });

  /** The apex of the arc and the nearest foreign atom to it, for a bend of either sign. */
  function apexGaps(doc: Doc, from: Anchor, to: Anchor): { chosen: number; other: number } {
    const a = resolveAnchor(doc, from);
    const b = resolveAnchor(doc, to);
    const len = distance(a, b);
    const bend = curvedBend(doc, from, to);
    const own = new Set<AtomId>();
    for (const anchor of [from, to]) {
      if (anchor.kind === 'atom') own.add(anchor.atom);
      if (anchor.kind === 'bond') {
        own.add(doc.bonds[anchor.bond]?.a1 as AtomId);
        own.add(doc.bonds[anchor.bond]?.a2 as AtomId);
      }
    }
    const others = Object.values(doc.atoms).filter((atom) => !own.has(atom.id));
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const n = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
    const gap = (sign: number): number => {
      const apex = {
        x: mid.x + n.x * sign * Math.abs(bend) * len * 0.5,
        y: mid.y + n.y * sign * Math.abs(bend) * len * 0.5,
      };
      return Math.min(...others.map((o) => distance(apex, o)));
    };
    const s = Math.sign(bend);
    return { chosen: gap(s), other: gap(-s) };
  }

  const acetic = drawn({ name: 'acetic acid', x: 0, y: 0 });
  const carbonylBond = Object.values(acetic.bonds).find((b) => b.order === 2) as Bond;
  const oxygenOf = (b: Bond): AtomId =>
    [b.a1, b.a2].find((id) => acetic.atoms[id]?.element === 'O') as AtomId;
  const carbonOf = (b: Bond): AtomId =>
    [b.a1, b.a2].find((id) => acetic.atoms[id]?.element === 'C') as AtomId;

  it('the electron-pair arrow from the C=O bond to O: apex 0.45 BLU, on the side away from the rest', () => {
    const from = { kind: 'bond', bond: carbonylBond.id, t: 0.5 } as const;
    const to = { kind: 'atom', atom: oxygenOf(carbonylBond) } as const;
    expect(Math.abs(curvedBend(acetic, from, to))).toBeCloseTo(1.8, 9);
    const { chosen, other } = apexGaps(acetic, from, to);
    expect(chosen).toBeGreaterThanOrEqual(other - 1e-9);
  });

  it('a fishhook from the OH oxygen to the carbonyl carbon bulges away from the other atoms', () => {
    const oh = Object.values(acetic.bonds).find(
      (b) => b.order === 1 && [b.a1, b.a2].some((id) => acetic.atoms[id]?.element === 'O'),
    ) as Bond;
    const from = { kind: 'atom', atom: oxygenOf(oh) } as const;
    const to = { kind: 'atom', atom: carbonOf(oh) } as const;
    const { chosen, other } = apexGaps(acetic, from, to);
    expect(chosen).toBeGreaterThanOrEqual(other - 0.1);
  });
});
