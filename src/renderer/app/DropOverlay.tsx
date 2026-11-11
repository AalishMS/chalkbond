// The drop overlay (SPEC-app-shell.md "Drop overlay", mock-up A13): over the whole content while
// files are dragged over the window. Hidden from assistive technology (Ctrl+O is the keyboard path).
export function DropOverlay(): React.JSX.Element {
  return (
    <div className="drop" data-testid="drop-overlay" aria-hidden="true">
      <div className="drop-box">
        <p className="drop-title">Drop to open</p>
        <p className="drop-sub">
          Chalkbond drawings (.chalk) and pictures made in Chalkbond (.png, .svg, .pdf)
        </p>
      </div>
    </div>
  );
}
