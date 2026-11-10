import { describe, expect, it } from 'vitest';
import { bluToScreen } from '../model/viewport';
import { hoverAt } from './hover';
import { reduce } from './reducer';
import { addEthane, atomId, freshState, testContext } from './testing';

const ctx = testContext();
const withEthane = () => {
  let s = reduce(freshState(), { type: 'canvas-resized', size: { w: 1000, h: 600 } }, ctx);
  s = reduce(s, { type: 'commit', label: 'Add bond', recipe: addEthane }, ctx);
  return s;
};
const onFirstAtom = (s: ReturnType<typeof withEthane>) =>
  bluToScreen(s.viewport, { x: 0, y: 0 }, 40);

describe('hoverAt (HV1)', () => {
  it('finds the atom under the pointer with the Bond tool', () => {
    const s = withEthane();
    expect(hoverAt(s, ctx.derive, onFirstAtom(s))).toEqual({ kind: 'atom', id: atomId(1) });
  });

  it('is null over empty canvas', () => {
    const s = withEthane();
    expect(hoverAt(s, ctx.derive, { x: 5, y: 5 })).toBeNull();
  });

  it('is null with the Text tool over an atom (texts only)', () => {
    const s = reduce(withEthane(), { type: 'select-tool', tool: 'text' }, ctx);
    expect(hoverAt(s, ctx.derive, onFirstAtom(s))).toBeNull();
  });

  it('is null while Space is held (the pointer pans) or an editor is open', () => {
    const s = withEthane();
    const held = reduce(s, { type: 'set-space', held: true }, ctx);
    expect(hoverAt(held, ctx.derive, onFirstAtom(held))).toBeNull();
    const editing = reduce(
      s,
      { type: 'set-editing', editing: { kind: 'label', atom: atomId(1) } },
      ctx,
    );
    expect(hoverAt(editing, ctx.derive, onFirstAtom(editing))).toBeNull();
  });
});
