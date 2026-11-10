import type { Size } from '../model/geometry';

/**
 * The second `<svg>` above the content, in screen px with no transform and no pointer events
 * (SPEC-editor.md "Rendering" step 5). Hover, selection and ghost shapes arrive with E14 onward;
 * for now it holds no shapes.
 */
export function Overlay({ size }: { size: Size }): React.JSX.Element {
  return (
    <svg
      className="canvas-layer overlay"
      data-testid="overlay"
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
      aria-hidden="true"
    />
  );
}
