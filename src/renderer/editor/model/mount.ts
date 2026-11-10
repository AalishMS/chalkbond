// Applies a patch plan to a host's child list (SPEC-editor.md "Rendering" step 2). The host is
// the DOM in the canvas and a fake in tests; the plan comes from `planPatch`.
import type { ItemKey } from '@core/svg-render';
import { planPatch, type Mounted } from './patch';

/** The few node operations the canvas needs; `N` is the node type (an `SVGGElement`). */
export interface PartHost<N> {
  /** A new, unattached node for the part, holding `svg`. */
  create(key: ItemKey, svg: string): N;
  /** Replaces the node's content with `svg`. */
  replace(node: N, svg: string): void;
  /** Puts `node` in front of `before`, or last when `before` is `null` (moves it if attached). */
  insert(node: N, before: N | null): void;
  remove(node: N): void;
}

function nodeOf<N>(nodes: ReadonlyMap<ItemKey, N>, key: ItemKey): N {
  const node = nodes.get(key);
  if (node === undefined) throw new Error(`no mounted node for ${key}`);
  return node;
}

/**
 * Brings the host from `mounted` to `parts`, touching only what changed, and returns the new
 * mounted list. `nodes` maps each mounted key to its node and is updated in place.
 */
export function mountParts<N>(
  host: PartHost<N>,
  nodes: Map<ItemKey, N>,
  mounted: readonly Mounted[],
  parts: readonly Mounted[],
): Mounted[] {
  const slot = (before: ItemKey | null): N | null =>
    before === null ? null : nodeOf(nodes, before);
  for (const op of planPatch(mounted, parts)) {
    switch (op.op) {
      case 'remove':
        host.remove(nodeOf(nodes, op.key));
        nodes.delete(op.key);
        break;
      case 'replace':
        host.replace(nodeOf(nodes, op.key), op.svg);
        break;
      case 'insert': {
        const node = host.create(op.key, op.svg);
        nodes.set(op.key, node);
        host.insert(node, slot(op.before));
        break;
      }
      case 'move':
        host.insert(nodeOf(nodes, op.key), slot(op.before));
        break;
    }
  }
  return parts.map((p) => ({ key: p.key, svg: p.svg }));
}
