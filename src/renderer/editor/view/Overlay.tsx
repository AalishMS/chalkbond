import type { Size } from '../model/geometry';
import type { OverlayGroup, OverlayShape } from '../model/overlay';

/** Two decimals are plenty for screen px and keep the markup short. */
const n = (x: number): number => Math.round(x * 100) / 100;

function Shape({ shape }: { shape: OverlayShape }): React.JSX.Element {
  switch (shape.kind) {
    case 'circle':
      return <circle cx={n(shape.c.x)} cy={n(shape.c.y)} r={shape.r} />;
    case 'band': {
      const { from, to, control } = shape;
      const d =
        control === undefined
          ? `M${n(from.x)} ${n(from.y)}L${n(to.x)} ${n(to.y)}`
          : `M${n(from.x)} ${n(from.y)}Q${n(control.x)} ${n(control.y)} ${n(to.x)} ${n(to.y)}`;
      return <path className="overlay-band" d={d} strokeWidth={shape.width} />;
    }
    case 'line':
      return (
        <line x1={n(shape.from.x)} y1={n(shape.from.y)} x2={n(shape.to.x)} y2={n(shape.to.y)} />
      );
    case 'box':
      return (
        <rect
          x={n(shape.rect.x)}
          y={n(shape.rect.y)}
          width={n(shape.rect.w)}
          height={n(shape.rect.h)}
          rx={shape.radius}
        />
      );
  }
}

interface OverlayProps {
  size: Size;
  groups: readonly OverlayGroup[];
}

/**
 * The second `<svg>` above the content, in screen px with no transform and no pointer events
 * (SPEC-editor.md "Rendering" step 5). Each group is drawn at its own group opacity (CSS), so
 * overlapping shapes do not compound. Only hover exists so far.
 */
export function Overlay({ size, groups }: OverlayProps): React.JSX.Element {
  return (
    <svg
      className="canvas-layer overlay"
      data-testid="overlay"
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
      aria-hidden="true"
    >
      {groups.map((group) => (
        <g
          key={group.kind}
          className={`overlay-${group.kind}`}
          data-testid={`overlay-${group.kind}`}
        >
          {group.shapes.map((shape, i) => (
            <Shape key={i} shape={shape} />
          ))}
        </g>
      ))}
    </svg>
  );
}
