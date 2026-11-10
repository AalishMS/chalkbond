// Test helper: an atom's label and satellites laid out the way `render` does it, in two passes
// (a lone pair or radical dot on the E slot moves the charge sign, so the label is rebuilt).
import type { Atom, Point } from '../../doc-model';
import { buildAtomLabel, type AtomLabel } from '../atom-label';
import { layoutSatellites, type SatelliteLayout } from '../satellites';
import type { ResolvedStyle } from '../style';

export interface AtomLayout {
  readonly label: AtomLabel | null;
  readonly sats: SatelliteLayout | null;
}

export function layoutAtom(
  atom: Atom,
  position: Point,
  directions: readonly Point[],
  style: ResolvedStyle,
  opts: { implicitH?: number; vertex?: boolean } = {},
): AtomLayout {
  const build = (chargeShift?: number): AtomLabel | null =>
    opts.vertex
      ? null
      : buildAtomLabel(
          {
            atom,
            implicitH: opts.implicitH ?? 0,
            neighbors: directions,
            position,
            ...(chargeShift === undefined ? {} : { chargeShift }),
          },
          style,
        );
  let label = build();
  const sats = layoutSatellites({ atom, position, directions, label }, style);
  if (sats && sats.chargeShift > 0 && label) label = build(sats.chargeShift);
  return { label, sats };
}
