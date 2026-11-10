// Handles of the selection (SPEC-editor.md "Canvas appearance", S5, S6, H2): the rotate handle
// above the frame, the end handles of a selected arrow, the end and bend handles of a selected
// curved arrow. Pure data in screen px; handles are tested before every other hit (H2).
import { resolveAnchor, type Doc, type Selection } from '@core/doc-model';
import { curveControls, type Scene } from '@core/svg-render';
import { frameRect, selectionInk } from './frame';
import { cubicAt, distance, type Point } from './geometry';
import type { Hit } from './hit-test';
import type { OverlayShape } from './overlay';
import { isEmptySelection } from './selection';
import { bluToScreen, type Viewport } from './viewport';

/** The rotate handle: circle radius, distance of its centre above the frame, stem length. */
export const ROTATE_R = 5;
export const ROTATE_RISE = 24;
export const ROTATE_STEM = ROTATE_RISE - ROTATE_R;
/** Hit radius of the rotate handle (diameter 20). */
export const ROTATE_HIT_R = 10;
/** Arrow end handle: square side; curved-arrow end: circle radius; bend: diamond side. */
export const END_SIDE = 8;
export const CURVE_END_R = 4;
export const BEND_SIDE = 9;
/** Hit box side of the arrow and curved-arrow handles. */
export const HIT_SIDE = 16;

export type HandleHit = Extract<Hit, { kind: 'handle' }>;

export interface Handle {
  readonly hit: HandleHit;
  /** Centre, screen px. */
  readonly at: Point;
  readonly shapes: readonly OverlayShape[];
  /** Whether the hit area is a circle (rotate) or a square. */
  readonly round: boolean;
}

const idNumber = (id: string): number => Number(id.slice(1));

/** The handles of `sel`, screen px; `offset` shifts them (the drag fast path). */
export function selectionHandles(
  doc: Doc,
  scene: Scene,
  v: Viewport,
  sel: Selection,
  offset: Point = { x: 0, y: 0 },
): Handle[] {
  if (isEmptySelection(sel)) return [];
  const bl = scene.style.bondLength;
  const handles: Handle[] = [];
  const ink = selectionInk(doc, scene, sel);
  if (ink !== null) {
    const frame = frameRect(v, ink, offset);
    const x = Math.round(frame.x + frame.w / 2) + 0.5;
    const at = { x, y: frame.y - ROTATE_RISE };
    handles.push({
      hit: { kind: 'handle', handle: 'rotate' },
      at,
      round: true,
      shapes: [
        { kind: 'line', from: { x, y: frame.y }, to: { x, y: frame.y - ROTATE_STEM } },
        { kind: 'circle', c: at, r: ROTATE_R },
      ],
    });
  }
  const shift = (p: Point): Point => ({ x: p.x + offset.x, y: p.y + offset.y });
  const ids = [...sel.objects].sort((a, b) => idNumber(a) - idNumber(b));
  for (const id of ids) {
    const obj = doc.objects[id];
    if (obj?.type === 'arrow') {
      const square = (handle: 'arrow-from' | 'arrow-to', p: Point): Handle => {
        const at = shift(bluToScreen(v, p, bl));
        return {
          hit: { kind: 'handle', handle, id },
          at,
          round: false,
          shapes: [
            {
              kind: 'box',
              rect: { x: at.x - END_SIDE / 2, y: at.y - END_SIDE / 2, w: END_SIDE, h: END_SIDE },
              radius: 0,
            },
          ],
        };
      };
      handles.push(square('arrow-from', obj.from), square('arrow-to', obj.to));
    } else if (obj?.type === 'curved-arrow') {
      const from = shift(bluToScreen(v, resolveAnchor(doc, obj.from), bl));
      const to = shift(bluToScreen(v, resolveAnchor(doc, obj.to), bl));
      // The drawn curve's t = 0.5 point (svg-render `curveControls`): its apex.
      const [p0, c1, c2, p3] = curveControls(from, to, obj.bend);
      const mid = cubicAt(p0, c1, c2, p3, 0.5);
      const end = (handle: 'curve-from' | 'curve-to', at: Point): Handle => ({
        hit: { kind: 'handle', handle, id },
        at,
        round: false,
        shapes: [{ kind: 'circle', c: at, r: CURVE_END_R }],
      });
      handles.push(end('curve-from', from), end('curve-to', to), {
        hit: { kind: 'handle', handle: 'curve-bend', id },
        at: mid,
        round: false,
        shapes: [{ kind: 'diamond', c: mid, size: BEND_SIDE }],
      });
    }
  }
  return handles;
}

const reaches = (h: Handle, p: Point): boolean =>
  h.round
    ? distance(h.at, p) <= ROTATE_HIT_R
    : Math.abs(p.x - h.at.x) <= HIT_SIDE / 2 && Math.abs(p.y - h.at.y) <= HIT_SIDE / 2;

/** The handle under screen point `p`: the nearest centre among those it reaches, else null. */
export function handleAt(handles: readonly Handle[], p: Point): HandleHit | null {
  let best: Handle | null = null;
  for (const h of handles) {
    if (reaches(h, p) && (best === null || distance(h.at, p) < distance(best.at, p))) best = h;
  }
  return best === null ? null : best.hit;
}

/** H2: the handle of the selection under screen point `p`, tested before every item. */
export function handleHit(
  doc: Doc,
  scene: Scene,
  v: Viewport,
  sel: Selection,
  p: Point,
): HandleHit | null {
  return handleAt(selectionHandles(doc, scene, v, sel), p);
}
