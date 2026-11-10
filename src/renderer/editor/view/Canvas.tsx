import { current } from '@core/doc-model';
import type { ItemKey } from '@core/svg-render';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { cursorFor } from '../model/cursor';
import { mountParts, type PartHost } from '../model/mount';
import { canvasOverlay } from '../model/overlay';
import type { Mounted } from '../model/patch';
import { PX_PER_PT } from '../model/viewport';
import type { EditorController } from '../state/controller';
import { EMPTY_SELECTION } from '../state/editor-state';
import { cssCursor } from './cursors';
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
  const committed = current(state.history);
  const { preview } = state;
  // A preview that only translates parts shows the committed scene; any other preview shows its
  // own document (SPEC-editor.md "Rendering" steps 3 and 4). A hover ghost (B6) shows the committed
  // scene plus only the parts it adds: hovering must not make a label jump to its laid-out-again
  // form.
  const hovering = preview?.hovering === true;
  const showPreview =
    preview !== null && preview.translate === undefined && preview.faded === undefined;
  const drawsPreview = showPreview && !hovering;
  const doc = drawsPreview ? preview.doc : committed;
  const { scene } = drawsPreview
    ? controller.derive.preview(doc)
    : controller.derive.committed(doc);
  const { perception } = drawsPreview
    ? controller.derive.preview(doc)
    : controller.derive.committed(doc);
  const parts = useMemo(() => {
    if (!showPreview || !hovering) return scene.parts;
    const have = new Set<string>(scene.parts.map((p) => p.key));
    const ghost = controller.derive
      .preview(preview.doc)
      .scene.parts.filter((p) => preview.added.has(p.key) && !have.has(p.key));
    return [...scene.parts, ...ghost];
  }, [scene, showPreview, hovering, preview, controller.derive]);
  const { dispatch } = controller.store;

  const ref = useRef<HTMLElement>(null);
  const layer = useRef<SVGGElement>(null);
  const nodes = useRef(new Map<ItemKey, SVGGElement>());
  const mounted = useRef<Mounted[]>([]);

  // Parts: patched in paint order, only what changed. React never renders into the layer.
  useLayoutEffect(() => {
    const g = layer.current;
    if (!g) return;
    mounted.current = mountParts(domHost(g), nodes.current, mounted.current, parts);
  }, [parts]);

  // Drag fast path: the moving parts' `<g>` are translated by the preview, nothing re-renders.
  const translate = preview?.translate;
  useLayoutEffect(() => {
    if (translate === undefined) return;
    const moved = translate.keys.flatMap((key) => nodes.current.get(key as ItemKey) ?? []);
    for (const g of moved)
      g.setAttribute('transform', `translate(${translate.dx} ${translate.dy})`);
    return () => {
      for (const g of moved) g.removeAttribute('transform');
    };
  }, [translate, scene]);

  // Erase: the parts about to go stay where they are, ghosted at `--erase-ghost-opacity` (E1).
  const faded = preview?.faded;
  useLayoutEffect(() => {
    if (faded === undefined) return;
    const parts = faded.flatMap((key) => nodes.current.get(key as ItemKey) ?? []);
    for (const g of parts) g.style.opacity = 'var(--erase-ghost-opacity)';
    return () => {
      for (const g of parts) g.style.removeProperty('opacity');
    };
  }, [faded, scene]);

  // A ghost preview (B6): the parts it adds are drawn at `--ghost-opacity`. The cleanup matters:
  // once the commit lands, the same `<g>` stays mounted as a real part.
  const added = showPreview ? preview.added : undefined;
  useLayoutEffect(() => {
    if (added === undefined || added.size === 0) return;
    const parts = [...added].flatMap((key) => nodes.current.get(key as ItemKey) ?? []);
    for (const g of parts) g.style.opacity = 'var(--ghost-opacity)';
    return () => {
      for (const g of parts) g.style.removeProperty('opacity');
    };
  }, [added, parts]);

  // T2: the part of the atom being edited is hidden; the box stands in its place.
  const editedAtom = state.editing?.kind === 'label' ? state.editing.atom : undefined;
  useLayoutEffect(() => {
    if (editedAtom === undefined) return;
    const g = nodes.current.get(`atom:${editedAtom}`);
    if (!g) return;
    g.style.visibility = 'hidden';
    return () => {
      g.style.removeProperty('visibility');
    };
  }, [editedAtom, parts]);

  // T2: likewise the part of the text being edited.
  const editedText =
    state.editing?.kind === 'text' && state.editing.target.kind === 'existing'
      ? state.editing.target.object
      : undefined;
  useLayoutEffect(() => {
    if (editedText === undefined) return;
    const g = nodes.current.get(`obj:${editedText}`);
    if (!g) return;
    g.style.visibility = 'hidden';
    return () => {
      g.style.removeProperty('visibility');
    };
  }, [editedText, parts]);

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

  useCanvasInput(ref, controller);

  const k = viewport.zoom * PX_PER_PT;
  const cursor = cursorFor(state.tool, state.hover, state.spaceHeld, state.gesture?.kind ?? null);
  return (
    <main
      ref={ref}
      className="canvas"
      data-testid="canvas"
      data-space={state.spaceHeld ? '' : undefined}
      data-cursor={cursor}
      style={
        cursor === 'erase'
          ? ({ '--cursor-erase': cssCursor('erase') } as React.CSSProperties)
          : undefined
      }
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
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <Overlay
        size={viewport.size}
        groups={canvasOverlay({
          hover: state.hover,
          tool: state.tool,
          // While an editor is open its box stands alone: no selection halo or handles.
          selection: state.editing === null ? state.selection : EMPTY_SELECTION,
          gesture: state.gesture,
          preview: state.preview,
          doc,
          scene,
          viewport,
          // Warnings are overlay only; while an editor is open the box stands alone.
          ...(state.editing === null ? { perception } : {}),
        })}
      />
      {children}
    </main>
  );
}
