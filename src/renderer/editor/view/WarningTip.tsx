import { current } from '@core/doc-model';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { placeTooltip } from '../model/tooltip-placement';
import { warningAnchor, warningAt } from '../model/warnings';
import type { EditorController } from '../state/controller';
import type { EditorState } from '../state/editor-state';
import { TooltipBubble } from './Tooltip';

/** Hover time before the warning's message shows (HV2, as every tooltip). */
const SHOW_DELAY_MS = 500;

interface WarningTipProps {
  controller: EditorController;
  state: EditorState;
}

/**
 * HV2: hovering an atom or bond that has a warning shows chem-core's message in a tooltip after
 * 500 ms (screen 08). It sits above the item, in the editor window's coordinates.
 */
export function WarningTip({ controller, state }: WarningTipProps): React.JSX.Element | null {
  const doc = current(state.history);
  const { perception, scene } = controller.derive.committed(doc);
  const quiet = state.editing !== null || state.gesture !== null;
  const warning = quiet ? null : warningAt(perception, state.hover);
  const hover = state.hover;
  // What is hovered, so a move to another warned item starts the delay again.
  const key =
    warning === null || hover === null ? null : `${hover.kind}:${'id' in hover ? hover.id : ''}`;
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (key === null) return;
    const timer = setTimeout(() => setShown(key), SHOW_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setShown(null);
    };
  }, [key]);

  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ key: string; x: number; y: number } | null>(null);
  const visible = key !== null && shown === key;
  const anchor = visible ? warningAnchor(doc, scene, state.viewport, hover) : null;
  const ax = anchor?.x;
  const ay = anchor?.y;
  const aw = anchor?.w;
  const ah = anchor?.h;
  useLayoutEffect(() => {
    const bubble = ref.current;
    const canvas = document.querySelector<HTMLElement>('[data-testid="canvas"]');
    const root = canvas?.closest<HTMLElement>('.editor');
    if (!visible || key === null || !bubble || !canvas || !root) return;
    if (ax === undefined || ay === undefined || aw === undefined || ah === undefined) return;
    const c = canvas.getBoundingClientRect();
    const r = root.getBoundingClientRect();
    const p = placeTooltip(
      { x: ax + c.left - r.left, y: ay + c.top - r.top, width: aw, height: ah },
      { width: bubble.offsetWidth, height: bubble.offsetHeight },
      { width: root.clientWidth, height: root.clientHeight },
      'above',
    );
    setAt({ key, x: p.x, y: p.y });
  }, [visible, key, ax, ay, aw, ah]);

  if (!visible || warning === null) return null;
  const placed = at?.key === key ? at : null;
  return (
    <TooltipBubble
      id={id}
      ref={ref}
      content={{ title: warning.message }}
      style={
        placed === null
          ? { left: 0, top: 0, visibility: 'hidden' }
          : { left: `${placed.x}px`, top: `${placed.y}px` }
      }
    />
  );
}
