// The app's tooltip (SPEC-app-shell.md T5; mock-up A18). The editor's tooltip is internal to the
// editor (its `index.ts` exports none), so the app has its own host with the same timing, the
// editor's `.tooltip` classes and tokens, and its own data attributes (`data-ui-tip*`), so a
// control tipped here is never also tipped by the editor's host, which reads `data-tip*`.
import { forwardRef, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

/** Hover time before a tooltip appears (the editor's). */
export const TIP_DELAY_MS = 500;
/** Time off all tipped controls after which the next tooltip waits again (the editor's). */
const WARM_UP_MS = 300;
/** Distance between the anchor and the bubble, and the smallest distance to the window edge. */
const GAP = 8;

/** What a tooltip shows: the name, an optional key cap, an optional help line. */
export interface Tip {
  title: string;
  key?: string;
  help?: string;
}

/** The data attributes that make a control tipped; `TooltipHost` reads them. */
export function tipAttrs(tip: Tip, side: 'below'): Record<string, string | undefined> {
  return {
    'data-ui-tip': tip.title,
    'data-ui-tip-key': tip.key,
    'data-ui-tip-help': tip.help,
    'data-ui-tip-side': side,
  };
}

interface BubbleProps {
  id: string;
  tip: Tip;
  style?: React.CSSProperties;
}

/** The tooltip itself: title, key cap, help line (the editor's markup and classes). */
export const TipBubble = forwardRef<HTMLDivElement, BubbleProps>(function TipBubble(
  { id, tip, style },
  ref,
) {
  return (
    <div className="tooltip" role="tooltip" id={id} ref={ref} style={style}>
      <div className="tooltip-title">
        <span>{tip.title}</span>
        {tip.key !== undefined && <kbd>{tip.key}</kbd>}
      </div>
      {tip.help !== undefined && <div className="tooltip-help">{tip.help}</div>}
    </div>
  );
});

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where a bubble of `tip` size goes: centred under the anchor, 8 px away, and kept 8 px inside
 * `span` (the window's extent in the bubble's own coordinates; the left margin wins when the
 * bubble is wider than the span).
 */
export function placeBelow(
  anchor: Box,
  tip: { width: number; height: number },
  span: { from: number; to: number },
): { x: number; y: number } {
  const x = anchor.x + (anchor.width - tip.width) / 2;
  const lo = span.from + GAP;
  const hi = Math.max(lo, span.to - GAP - tip.width);
  return { x: Math.min(Math.max(x, lo), hi), y: anchor.y + anchor.height + GAP };
}

interface Active {
  anchor: HTMLElement;
  tip: Tip;
}

interface Placed {
  active: Active;
  x: number;
  y: number;
}

function anchorOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>('[data-ui-tip]') : null;
}

function read(anchor: HTMLElement): Active {
  const d = anchor.dataset;
  const tip: Tip = { title: d['uiTip'] ?? '' };
  if (d['uiTipKey'] !== undefined) tip.key = d['uiTipKey'];
  if (d['uiTipHelp'] !== undefined) tip.help = d['uiTipHelp'];
  return { anchor, tip };
}

/**
 * The app's tooltip. Mount it once inside a `position: relative` element; the bubble sits under
 * the control that carries `data-ui-tip`. Shows after a 500 ms hover (no delay while warm, until
 * the pointer has been off every tipped control for 300 ms) or at once on keyboard focus; gone on
 * pointer down, Esc, blur and pointer leave, as the editor's.
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
        }, TIP_DELAY_MS);
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

  // Measure the bubble, then place it in its offset parent's coordinates.
  useLayoutEffect(() => {
    const bubble = ref.current;
    const parent = bubble?.offsetParent;
    if (active === null || bubble === null || !(parent instanceof HTMLElement)) return;
    const p = parent.getBoundingClientRect();
    const a = active.anchor.getBoundingClientRect();
    const at = placeBelow(
      { x: a.left - p.left, y: a.top - p.top, width: a.width, height: a.height },
      { width: bubble.offsetWidth, height: bubble.offsetHeight },
      { from: -p.left, to: document.documentElement.clientWidth - p.left },
    );
    setPlaced({ active, x: at.x, y: at.y });
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
    <TipBubble
      id={id}
      ref={ref}
      tip={active.tip}
      style={
        here === null
          ? { left: 0, top: 0, visibility: 'hidden' }
          : { left: `${here.x}px`, top: `${here.y}px` }
      }
    />
  );
}
