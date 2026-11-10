// Where the condition texts of an arrow sit (SPEC-editor.md S6, T3). Until the Text tool's
// placement rules arrive (E28) this keeps each text's offset from the arrow's midpoint, so a text
// above an arrow stays above it when an end moves.
import type { ArrowObject, Point, TextObject } from '@core/doc-model';

const midpoint = (a: ArrowObject): Point => ({
  x: (a.from.x + a.to.x) / 2,
  y: (a.from.y + a.to.y) / 2,
});

/** The position of `text`, attached to `before`, once that arrow has become `after`. */
export function conditionPosition(
  text: TextObject,
  before: ArrowObject,
  after: ArrowObject,
): Point {
  const was = midpoint(before);
  const now = midpoint(after);
  return { x: text.at.x + (now.x - was.x), y: text.at.y + (now.y - was.y) };
}
