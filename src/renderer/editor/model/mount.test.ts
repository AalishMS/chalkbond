import type { ItemKey } from '@core/svg-render';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { mountParts, type PartHost } from './mount';
import type { Mounted } from './patch';

/** A fake DOM: a node is an object; `children` is the host's child list. */
interface FakeNode {
  key: ItemKey;
  svg: string;
}

function fakeHost(): { host: PartHost<FakeNode>; children: FakeNode[]; touched: Set<FakeNode> } {
  const children: FakeNode[] = [];
  const touched = new Set<FakeNode>();
  const host: PartHost<FakeNode> = {
    create: (key, svg) => ({ key, svg }),
    replace(node, svg) {
      node.svg = svg;
      touched.add(node);
    },
    insert(node, before) {
      const at = children.indexOf(node);
      if (at >= 0) children.splice(at, 1);
      children.splice(before === null ? children.length : children.indexOf(before), 0, node);
      touched.add(node);
    },
    remove(node) {
      children.splice(children.indexOf(node), 1);
      touched.add(node);
    },
  };
  return { host, children, touched };
}

const part = (key: ItemKey, svg = `<g>${key}</g>`): Mounted => ({ key, svg });
const view = (children: FakeNode[]): Mounted[] => children.map((c) => ({ key: c.key, svg: c.svg }));

describe('mountParts', () => {
  it('mounts every part in paint order on an empty host', () => {
    const { host, children } = fakeHost();
    const nodes = new Map<ItemKey, FakeNode>();
    const parts = [part('bond:b1'), part('atom:a1'), part('atom:a2')];
    const mounted = mountParts(host, nodes, [], parts);
    expect(view(children)).toEqual(parts);
    expect(mounted).toEqual(parts);
    expect([...nodes.keys()].sort()).toEqual(['atom:a1', 'atom:a2', 'bond:b1']);
  });

  it('touches only the changed part, keeping the other nodes', () => {
    const { host, children, touched } = fakeHost();
    const nodes = new Map<ItemKey, FakeNode>();
    const first = [part('bond:b1'), part('atom:a1'), part('atom:a2')];
    const mounted = mountParts(host, nodes, [], first);
    const before = [...children];
    touched.clear();
    const next = [first[0] as Mounted, part('atom:a1', '<g>moved</g>'), first[2] as Mounted];
    mountParts(host, nodes, mounted, next);
    expect([...touched]).toEqual([before[1]]);
    expect(children).toEqual([before[0], before[1], before[2]]);
    expect(children.every((c, i) => c === before[i])).toBe(true);
    expect(view(children)).toEqual(next);
  });

  it('removes parts that are gone and forgets their nodes', () => {
    const { host, children } = fakeHost();
    const nodes = new Map<ItemKey, FakeNode>();
    const mounted = mountParts(host, nodes, [], [part('atom:a1'), part('atom:a2')]);
    mountParts(host, nodes, mounted, [part('atom:a2')]);
    expect(view(children)).toEqual([part('atom:a2')]);
    expect(nodes.has('atom:a1')).toBe(false);
  });

  it('reorders by moving nodes, not recreating them', () => {
    const { host, children } = fakeHost();
    const nodes = new Map<ItemKey, FakeNode>();
    const a = part('atom:a1');
    const b = part('atom:a2');
    const mounted = mountParts(host, nodes, [], [a, b]);
    const [na, nb] = [...children];
    mountParts(host, nodes, mounted, [b, a]);
    expect(children[0]).toBe(nb);
    expect(children[1]).toBe(na);
  });

  it('ends with the parts on the host for any sequence of scenes (property)', () => {
    const keys: ItemKey[] = ['atom:a1', 'atom:a2', 'atom:a3', 'bond:b4', 'obj:o5'];
    const scene = fc
      .shuffledSubarray(keys)
      .chain((ks) =>
        fc
          .array(fc.constantFrom('x', 'y'), { minLength: ks.length, maxLength: ks.length })
          .map((tags) => ks.map((k, i) => part(k, `<g>${k}${tags[i]}</g>`))),
      );
    fc.assert(
      fc.property(fc.array(scene, { minLength: 1, maxLength: 6 }), (scenes) => {
        const { host, children } = fakeHost();
        const nodes = new Map<ItemKey, FakeNode>();
        let mounted: Mounted[] = [];
        for (const s of scenes) {
          mounted = mountParts(host, nodes, mounted, s);
          expect(view(children)).toEqual(s);
          expect(mounted).toEqual(s);
          expect(nodes.size).toBe(s.length);
        }
      }),
    );
  });
});
