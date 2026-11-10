import { forwardRef, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { placeTooltip, type TipSide } from '../model/tooltip-placement';
import type { TipContent } from '../state/tips';

/** Hover time before a tooltip appears. */
const SHOW_DELAY_MS = 500;
/** Time off all tooltipped controls after which the next tooltip waits again. */
const WARM_UP_MS = 300;

/** The data attributes that make a control tooltipped; `TooltipHost` reads them. */
export function tipProps(content: TipContent, side: TipSide): Record<string, string | undefined> {
  return {
    'data-tip': content.title,
    'data-tip-key': content.key,
    'data-tip-help': content.help,
    'data-tip-side': side,
  };
}

interface BubbleProps {
  id: string;
  content: TipContent;
  style?: React.CSSProperties;
}

/** The tooltip itself: title, key cap, help line. */
export const TooltipBubble = forwardRef<HTMLDivElement, BubbleProps>(function TooltipBubble(
  { id, content, style },
  ref,
) {
  return (
    <div className="tooltip" role="tooltip" id={id} ref={ref} style={style}>
      <div className="tooltip-title">
        <span>{content.title}</span>
        {content.key !== undefined && <kbd>{content.key}</kbd>}
      </div>
      {content.help !== undefined && <div className="tooltip-help">{content.help}</div>}
    </div>
  );
});

interface Active {
  anchor: HTMLElement;
  content: TipContent;
  side: TipSide;
}

interface Placed {
  active: Active;
  x: number;
  y: number;
}

function anchorOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>('[data-tip]') : null;
}

function read(anchor: HTMLElement): Active {
  const d = anchor.dataset;
  const content: TipContent = { title: d['tip'] ?? '' };
  if (d['tipKey'] !== undefined) content.key = d['tipKey'];
  if (d['tipHelp'] !== undefined) content.help = d['tipHelp'];
  const side = d['tipSide'] === 'right' || d['tipSide'] === 'above' ? d['tipSide'] : 'below';
  return { anchor, content, side };
}

/**
 * The one tooltip of the editor window. Shows after a 500 ms hover (no delay while warm, until
 * the pointer has been off every tooltipped control for 300 ms) or at once on keyboard focus;
 * gone on pointer down, Esc, blur and pointer leave. Never under the pointer: it sits beside
 * the anchor (see `placeTooltip`).
 */
export function TooltipHost(): React.JSX.Element | null {
  const [active, setActive] = useState<Active | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    let warm = false;
    let hover: HTMLElement | null = null;
    let shown: HTMLElement | null = null;
    let suppressed: HTMLElement | null = null;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let coolTimer: ReturnType<typeof setTimeout> | undefined;

    const hide = (): void => {
      clearTimeout(showTimer);
      showTimer = undefined;
      shown = null;
      setActive(null);
    };
    const show = (anchor: HTMLElement, viaPointer: boolean): void => {
      shown = anchor;
      if (viaPointer) warm = true;
      setActive(read(anchor));
    };

    const onOver = (e: PointerEvent): void => {
      const anchor = anchorOf(e.target);
      if (anchor === null || anchor === hover) return;
      clearTimeout(coolTimer);
      hover = anchor;
      hide();
      if (suppressed === anchor) return;
      if (warm) show(anchor, true);
      else {
        showTimer = setTimeout(() => {
          showTimer = undefined;
          show(anchor, true);
        }, SHOW_DELAY_MS);
      }
    };
    const onOut = (e: PointerEvent): void => {
      const anchor = anchorOf(e.target);
      if (anchor === null || anchor !== hover || anchorOf(e.relatedTarget) === anchor) return;
      hover = null;
      if (suppressed === anchor) suppressed = null;
      if (shown === anchor || showTimer !== undefined) hide();
      if (anchorOf(e.relatedTarget) === null) {
        clearTimeout(coolTimer);
        coolTimer = setTimeout(() => {
          warm = false;
        }, WARM_UP_MS);
      }
    };
    const onDown = (e: PointerEvent): void => {
      const anchor = anchorOf(e.target);
      hide();
      if (anchor !== null) suppressed = anchor;
    };
    const onFocusIn = (e: FocusEvent): void => {
      const anchor = anchorOf(e.target);
      if (anchor === null || !anchor.matches(':focus-visible')) return;
      hide();
      show(anchor, false);
    };
    const onFocusOut = (e: FocusEvent): void => {
      if (shown !== null && anchorOf(e.target) === shown) hide();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || (shown === null && showTimer === undefined)) return;
      suppressed = hover;
      hide();
    };

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(coolTimer);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  // Measure the bubble, then place it in the editor root's coordinates.
  useLayoutEffect(() => {
    const bubble = ref.current;
    const root = active?.anchor.closest<HTMLElement>('.editor');
    if (active === null || bubble === null || !root) return;
    const r = root.getBoundingClientRect();
    const a = active.anchor.getBoundingClientRect();
    const p = placeTooltip(
      { x: a.left - r.left, y: a.top - r.top, width: a.width, height: a.height },
      { width: bubble.offsetWidth, height: bubble.offsetHeight },
      { width: root.clientWidth, height: root.clientHeight },
      active.side,
    );
    setPlaced({ active, x: p.x, y: p.y });
  }, [active]);

  // The anchor is described by the tooltip while it is shown.
  useEffect(() => {
    const anchor = active?.anchor;
    anchor?.setAttribute('aria-describedby', id);
    return () => {
      anchor?.removeAttribute('aria-describedby');
    };
  }, [active, id]);

  if (active === null) return null;
  const here = placed?.active === active ? placed : null;
  return (
    <TooltipBubble
      id={id}
      ref={ref}
      content={active.content}
      style={
        here === null
          ? { left: 0, top: 0, visibility: 'hidden' }
          : { left: `${here.x}px`, top: `${here.y}px` }
      }
    />
  );
}
