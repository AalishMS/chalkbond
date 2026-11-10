import { current } from '@core/doc-model';
import type { ItemKey } from '@core/svg-render';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { mountParts, type PartHost } from '../model/mount';
import type { Mounted } from '../model/patch';
import { PX_PER_PT } from '../model/viewport';
import type { EditorController } from '../state/controller';
import { Overlay } from './Overlay';
import { HINT_ID } from './StatusBar';
import { useCanvasInput } from './use-canvas-input';
import { useEditorState } from './use-store';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The part host over the DOM: one `<g data-key>` per part inside `layer`, content parsed as SVG. */
const domHost = (layer: SVGGElement): PartHost<SVGGElement> => ({
  create(key, svg) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('data-key', key);
    g.innerHTML = svg;
    return g;
  },
  replace(node, svg) {
    node.innerHTML = svg;
  },
  insert: (node, before) => layer.insertBefore(node, before),
  remove: (node) => node.remove(),
});

interface CanvasProps {
  controller: EditorController;
  children?: React.ReactNode;
}

/**
 * The drawing area. One tab stop (K4), focused at launch (Decision 5). It holds the content
 * `<svg>` (parts patched in place, not owned by React), the overlay `<svg>` and, on top, any
 * children (the empty state).
 */
export function Canvas({ controller, children }: CanvasProps): React.JSX.Element {
  const state = useEditorState(controller.store);
  const { viewport } = state;
  const { scene } = controller.derive.committed(current(state.history));
  const { dispatch } = controller.store;

  const ref = useRef<HTMLElement>(null);
  const layer = useRef<SVGGElement>(null);
  const nodes = useRef(new Map<ItemKey, SVGGElement>());
  const mounted = useRef<Mounted[]>([]);

  // Parts: patched in paint order, only what changed. React never renders into the layer.
  useLayoutEffect(() => {
    const g = layer.current;
    if (!g) return;
    mounted.current = mountParts(domHost(g), nodes.current, mounted.current, scene.parts);
  }, [scene]);

  // Focus at launch; the ring shows only when Tab brought focus here (K4).
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Tab') canvas.dataset['keyboard'] = '';
    };
    const clear = (): void => {
      delete canvas.dataset['keyboard'];
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', clear, true);
    canvas.addEventListener('blur', clear);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', clear, true);
      canvas.removeEventListener('blur', clear);
    };
  }, []);

  // The canvas size drives the viewport (V2 on the first measure, centre kept on resize).
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const measure = (): void =>
      dispatch({
        type: 'canvas-resized',
        size: { w: canvas.clientWidth, h: canvas.clientHeight },
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [dispatch]);

  useCanvasInput(ref, controller.store);

  const k = viewport.zoom * PX_PER_PT;
  return (
    <main
      ref={ref}
      className="canvas"
      data-testid="canvas"
      data-space={state.spaceHeld ? '' : undefined}
      role="application"
      aria-label="Drawing canvas"
      aria-describedby={HINT_ID}
      tabIndex={0}
    >
      <svg className="canvas-layer" data-testid="content" aria-hidden="true">
        <g
          ref={layer}
          data-layer="content"
          transform={`matrix(${k} 0 0 ${k} ${viewport.pan.x} ${viewport.pan.y})`}
        />
      </svg>
      <Overlay size={viewport.size} />
      {children}
    </main>
  );
}
