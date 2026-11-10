// The minimal DOM patch from the mounted keyed parts to a new scene's parts
// (SPEC-editor.md "Rendering" step 2; SPEC-svg-render.md "Editor contract").
import type { ItemKey } from '@core/svg-render';

/** A mounted node: its key and the markup it currently holds. A `RenderPart` fits. */
export interface Mounted {
  readonly key: ItemKey;
  readonly svg: string;
}

/**
 * One DOM operation, applied in plan order. `before` is the key of the sibling the node goes in
 * front of (`insertBefore`), or `null` to append; it is always mounted when the operation runs.
 */
export type PatchOp =
  | { readonly op: 'remove'; readonly key: ItemKey }
  | { readonly op: 'replace'; readonly key: ItemKey; readonly svg: string }
  | {
      readonly op: 'insert';
      readonly key: ItemKey;
      readonly svg: string;
      readonly before: ItemKey | null;
    }
  | { readonly op: 'move'; readonly key: ItemKey; readonly before: ItemKey | null };

/** The values of one longest strictly increasing subsequence of `seq`. */
function stableValues(seq: readonly number[]): Set<number> {
  const tails: number[] = []; // seq index of the smallest tail of an increasing run of length t+1
  const prev: number[] = [];
  seq.forEach((value, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((seq[tails[mid] as number] as number) < value) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? (tails[lo - 1] as number) : -1;
    tails[lo] = i;
  });
  const out = new Set<number>();
  for (let i = tails[tails.length - 1] ?? -1; i >= 0; i = prev[i] as number) {
    out.add(seq[i] as number);
  }
  return out;
}

/**
 * The operations that turn `mounted` into `parts`: removes first, then, walking `parts` from the
 * end, an insert for a new key, a move for a kept key outside the longest run that is already in
 * order (so a reorder moves as few nodes as possible), and a replace where the markup changed.
 * Keys are unique within each list.
 */
export function planPatch(mounted: readonly Mounted[], parts: readonly Mounted[]): PatchOp[] {
  const newIndex = new Map<ItemKey, number>(parts.map((p, i) => [p.key, i]));
  const oldSvg = new Map<ItemKey, string>(mounted.map((m) => [m.key, m.svg]));
  const ops: PatchOp[] = [];
  for (const m of mounted) {
    if (!newIndex.has(m.key)) ops.push({ op: 'remove', key: m.key });
  }
  const keptOrder = mounted.flatMap((m) => newIndex.get(m.key) ?? []);
  const inPlace = stableValues(keptOrder);
  let before: ItemKey | null = null;
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i] as Mounted;
    const old = oldSvg.get(part.key);
    if (old === undefined) {
      ops.push({ op: 'insert', key: part.key, svg: part.svg, before });
    } else {
      if (!inPlace.has(i)) ops.push({ op: 'move', key: part.key, before });
      if (old !== part.svg) ops.push({ op: 'replace', key: part.key, svg: part.svg });
    }
    before = part.key;
  }
  return ops;
}

/**
 * The list model of what the DOM does with a plan; the reference the canvas implementation must
 * match. Throws when an operation names a key that is not mounted.
 */
export function applyPatch(mounted: readonly Mounted[], ops: readonly PatchOp[]): Mounted[] {
  const list = mounted.map((m) => ({ key: m.key, svg: m.svg }));
  const indexOf = (key: ItemKey): number => {
    const i = list.findIndex((m) => m.key === key);
    if (i < 0) throw new Error(`patch refers to an unmounted key: ${key}`);
    return i;
  };
  const slot = (before: ItemKey | null): number =>
    before === null ? list.length : indexOf(before);
  for (const op of ops) {
    if (op.op === 'remove') {
      list.splice(indexOf(op.key), 1);
    } else if (op.op === 'replace') {
      list[indexOf(op.key)] = { key: op.key, svg: op.svg };
    } else if (op.op === 'insert') {
      list.splice(slot(op.before), 0, { key: op.key, svg: op.svg });
    } else {
      const [node] = list.splice(indexOf(op.key), 1);
      list.splice(slot(op.before), 0, node as Mounted);
    }
  }
  return list;
}
