// The tab strip (SPEC-app-shell.md T2, T3, T5, T6, T16; mock-up A18). Presentational: it renders
// the view-models it is given and reports what the user did; no flow lives here (TB20 owns them).
// It goes into the editor's `tabs` slot (editor R56); the canvas region is the `role="tabpanel"`
// that the editor builds, labelled by the active tab through `tabDomId`.
// TB25 adds the interactions: drag to reorder (T13), overflow scrolling (T14), the tab menu's
// trigger (T15, CM4) and a double-click on the empty strip. Their rules are the pure
// `model/tab-drag.ts`; this file measures the DOM, passes numbers in and applies the answers.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, PointerEvent, WheelEvent } from 'react';
import {
  cancelsDrag,
  chevronTarget,
  contentX,
  dragStarts,
  dropIndex,
  dropLineX,
  liftLeft,
  makeRoom,
  revealLeft,
  scrollButtons,
  tabMenuTrigger,
  wheelScroll,
  type DragInterruption,
  type MenuKeyEvent,
  type ScrollMetrics,
  type Slot,
} from './model/tab-drag';
import { tipAttrs, TooltipHost, type Tip } from './ui/Tooltip';
import './tab-strip.css';

/**
 * T6: what a tab shows before its label. `dot`: unsaved (an `untitled` tab with content, an edited
 * `picture`, a `kept` tab). `unavailable` (AS6) and `unkept` (SS6) show the warning icon in the
 * dot's place; they differ only in the help text. A file tab, also while it writes, is `none`.
 */
export type TabMarker = 'none' | 'dot' | 'unavailable' | 'unkept';

/** One tab as the strip shows it. `label` is T3's label (the model's `label(tab)`). */
export interface TabView {
  readonly id: string;
  readonly label: string;
  readonly marker: TabMarker;
}

export interface TabStripProps {
  readonly tabs: readonly TabView[];
  /** The active tab; it holds the strip's one tab stop. */
  readonly activeId: string;
  /** A click on a tab, or Enter or Space on a focused one. */
  onActivate(id: string): void;
  /** The cross, or a middle-click on a tab. */
  onClose(id: string): void;
  /** The + button, and a double-click on the empty strip (T13). */
  onNew(): void;
  /**
   * T13: a drag dropped tab `from` at index `to` (both indexes of `tabs`, `from !== to`), the
   * arguments of the model's `move`. Never called for a cancelled drag.
   */
  onMove(from: number, to: number): void;
  /**
   * T15, CM4: the tab menu was asked for on tab `id` (a right-click, the context-menu key or
   * Shift+F10). `at` is content CSS px under the tab for a key, `null` for the cursor: pass both to
   * `showTabMenu` (I10) and act on `id`, not on the active tab.
   */
  onTabMenu(id: string, at: { x: number; y: number } | null): void;
}

/** The DOM id of a tab: pass `tabDomId(activeId)` as the editor's `tabPanelLabelledBy`. */
export const tabDomId = (id: string): string => `tab-${id}`;

/** T16: the accessible name is the label plus what the marker says. */
export function tabName(tab: TabView): string {
  if (tab.marker === 'dot') return `${tab.label}, not saved as a file yet`;
  if (tab.marker === 'unavailable') return `${tab.label}, couldn't save`;
  if (tab.marker === 'unkept') return `${tab.label}, couldn't keep`;
  return tab.label;
}

/** T15 (CM4): a right-click on tab `id` asks for the menu at the cursor. */
export function tabMenuMouseAction(
  id: string,
  e: { preventDefault(): void },
  onTabMenu: TabStripProps['onTabMenu'],
): void {
  e.preventDefault();
  onTabMenu(id, null);
}

/** T15: the context-menu key or Shift+F10 on tab `id` asks for the menu under it; true if handled. */
export function tabMenuKeyAction(
  e: MenuKeyEvent,
  id: string,
  rect: { left: number; bottom: number },
  onTabMenu: TabStripProps['onTabMenu'],
): boolean {
  const trigger = tabMenuTrigger(e, rect);
  if (trigger === null) return false;
  onTabMenu(id, trigger.at);
  return true;
}

/** T14: a scroll button, shown only on a side with more tabs; never a tab stop. */
export function ScrollButton({
  side,
  onPress,
}: {
  side: 'left' | 'right';
  onPress(): void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="btn tab-scroll"
      tabIndex={-1}
      aria-label={`Scroll tabs ${side}`}
      data-testid={`tab-scroll-${side}`}
      onClick={onPress}
    >
      <svg className="icon icon-16" aria-hidden="true">
        <use href={`#chevron-${side}`} />
      </svg>
    </button>
  );
}

/** T5: the help line under the label in a tab's tooltip. */
export function tabHelp(tab: TabView): string {
  switch (tab.marker) {
    case 'dot':
      return 'Not saved as a file yet. Chalkbond keeps it for you. Press Ctrl+S to save it.';
    case 'unavailable':
      return "Couldn't save this file. Check that its folder is still there, or use Save as.";
    case 'unkept':
      return "Chalkbond couldn't keep this drawing. Free some disk space, or save it with Save as.";
    case 'none':
      return 'Switch tabs with Ctrl+Tab and Ctrl+Shift+Tab.';
  }
}

export type StripKeyAction = { focus: number } | { activate: true };

/**
 * T16: what a key does on the focused tab `index` of `count`. Arrows move focus and wrap, Home and
 * End go to the ends, Enter and Space activate (manual activation, as the rail); arrows never
 * activate. Null for any other key.
 */
export function stripKey(key: string, index: number, count: number): StripKeyAction | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight':
      return { focus: (index + 1) % count };
    case 'ArrowLeft':
      return { focus: (index - 1 + count) % count };
    case 'Home':
      return { focus: 0 };
    case 'End':
      return { focus: count - 1 };
    case 'Enter':
    case ' ':
      return { activate: true };
    default:
      return null;
  }
}

const CLOSE_TIP: Tip = { title: 'Close tab', key: 'Ctrl+W' };
const NEW_TIP: Tip = { title: 'New tab', key: 'Ctrl+T' };

/** What the strip draws while a tab is being dragged (T13). */
interface DragView {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  /** How far the lifted tab is drawn from its own slot. */
  readonly lift: number;
  /** How far each tab shifts to make room. */
  readonly shifts: readonly number[];
  /** The centre x of the drop line. */
  readonly line: number;
}

/** A press on a tab, from the press to the drop or a cancel. */
interface Gesture {
  readonly id: string;
  readonly from: number;
  readonly pointerId: number;
  readonly startClientX: number;
  readonly grab: number;
  readonly slots: readonly Slot[];
  started: boolean;
  to: number;
}

const NO_METRICS: ScrollMetrics = { scrollLeft: 0, clientWidth: 0, scrollWidth: 0, reserved: 0 };

const sameMetrics = (a: ScrollMetrics, b: ScrollMetrics): boolean =>
  a.scrollLeft === b.scrollLeft &&
  a.clientWidth === b.clientWidth &&
  a.scrollWidth === b.scrollWidth &&
  a.reserved === b.reserved;

export function TabStrip({
  tabs,
  activeId,
  onActivate,
  onClose,
  onNew,
  onMove,
  onTabMenu,
}: TabStripProps): React.JSX.Element {
  // One tab stop: the active tab, or the first when the id matches none.
  const stop = tabs.some((t) => t.id === activeId) ? activeId : tabs[0]?.id;

  const tabsRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<ScrollMetrics>(NO_METRICS);
  const [drag, setDrag] = useState<DragView | null>(null);
  // T14: the active tab is scrolled into view until the user scrolls by hand (wheel, a button).
  const revealRef = useRef(true);
  const gestureRef = useRef<Gesture | null>(null);
  const endGestureRef = useRef<(() => void) | null>(null);
  const onMoveRef = useRef(onMove);
  // A click right after a drop is not a click on the tab; a menu event right after a key trigger
  // or a right press that cancelled a drag is not a second request (T13, T15).
  const justDraggedRef = useRef(false);
  const swallowMenuRef = useRef(false);

  useEffect(() => {
    onMoveRef.current = onMove;
  });

  const measure = useCallback((): void => {
    const el = tabsRef.current;
    if (el === null) return;
    const buttons = el.parentElement?.querySelectorAll<HTMLElement>('.tab-scroll') ?? [];
    const next: ScrollMetrics = {
      scrollLeft: el.scrollLeft,
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      reserved: [...buttons].reduce((n, b) => n + b.offsetWidth, 0),
    };
    setMetrics((prev) => (sameMetrics(prev, next) ? prev : next));
  }, []);

  const sync = useCallback((): void => {
    const el = tabsRef.current;
    if (el === null) return;
    if (revealRef.current && gestureRef.current === null) {
      const tab = [...el.children].find(
        (c): c is HTMLElement => c instanceof HTMLElement && c.dataset['tabId'] === activeId,
      );
      if (tab !== undefined) {
        const left = revealLeft(
          tab.offsetLeft,
          tab.offsetLeft + tab.offsetWidth,
          el.scrollLeft,
          el.clientWidth,
        );
        if (left !== el.scrollLeft) el.scrollLeft = left;
      }
    }
    measure();
  }, [activeId, measure]);

  // A new, closed or chosen tab (also by key) is scrolled into view.
  useLayoutEffect(() => {
    revealRef.current = true;
  }, [activeId, tabs.length]);
  useLayoutEffect(() => {
    sync();
  });
  useEffect(() => {
    const el = tabsRef.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    if (el.parentElement !== null) observer.observe(el.parentElement);
    return () => observer.disconnect();
  }, [sync]);
  useEffect(() => () => endGestureRef.current?.(), []);

  const shown = scrollButtons(metrics);

  const scrollBy = (side: 'left' | 'right'): void => {
    const el = tabsRef.current;
    if (el === null) return;
    revealRef.current = false;
    el.scrollLeft = chevronTarget(side, el.scrollLeft, el.clientWidth, el.scrollWidth);
  };

  const onWheel = (e: WheelEvent<HTMLDivElement>): void => {
    const el = tabsRef.current;
    if (el === null || el.scrollWidth <= el.clientWidth) return;
    revealRef.current = false;
    el.scrollLeft += wheelScroll(e, el.clientWidth);
  };

  // T13: press on a tab; past 4 px sideways it becomes a drag, else it stays a click.
  const onTabPress = (index: number, id: string, e: PointerEvent<HTMLDivElement>): void => {
    justDraggedRef.current = false;
    swallowMenuRef.current = false;
    const el = tabsRef.current;
    if (e.button !== 0 || el === null) return;
    if (e.target instanceof Element && e.target.closest('.tab-close') !== null) return;
    endGestureRef.current?.();
    const slots: Slot[] = [...el.querySelectorAll<HTMLElement>('[role="tab"]')].map((t) => ({
      left: t.offsetLeft,
      width: t.offsetWidth,
    }));
    const here = slots[index];
    if (here === undefined) return;
    const g: Gesture = {
      id,
      from: index,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      grab: contentX(e.clientX, el.getBoundingClientRect().left, el.scrollLeft) - here.left,
      slots,
      started: false,
      to: index,
    };
    gestureRef.current = g;

    const finish = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancelled);
      window.removeEventListener('pointerdown', pressed, true);
      window.removeEventListener('keydown', keyed, true);
      window.removeEventListener('blur', blurred);
      el.removeEventListener('lostpointercapture', lost);
      if (g.started && el.hasPointerCapture(g.pointerId)) el.releasePointerCapture(g.pointerId);
      gestureRef.current = null;
      endGestureRef.current = null;
      setDrag(null);
    };
    const interrupt = (ev: DragInterruption): boolean => {
      if (!cancelsDrag(ev)) return false;
      if (ev.type === 'press' && g.started) swallowMenuRef.current = true;
      finish();
      return true;
    };
    const move = (ev: globalThis.PointerEvent): void => {
      if (ev.pointerId !== g.pointerId) return;
      if (!g.started) {
        if (!dragStarts(g.startClientX, ev.clientX)) return;
        g.started = true;
        revealRef.current = false;
        el.setPointerCapture(g.pointerId);
      }
      const x = contentX(ev.clientX, el.getBoundingClientRect().left, el.scrollLeft);
      const left = liftLeft(g.slots, g.from, x, g.grab);
      const slot = g.slots[g.from];
      if (slot === undefined) return;
      g.to = dropIndex(g.slots, g.from, left + slot.width / 2);
      setDrag({
        id: g.id,
        from: g.from,
        to: g.to,
        lift: left - slot.left,
        shifts: makeRoom(g.slots, g.from, g.to),
        line: dropLineX(g.slots, g.from, g.to),
      });
    };
    const up = (ev: globalThis.PointerEvent): void => {
      if (ev.pointerId !== g.pointerId) return;
      const { started, from, to } = g;
      justDraggedRef.current = started;
      finish();
      if (started && to !== from) onMoveRef.current(from, to);
    };
    const cancelled = (ev: globalThis.PointerEvent): void => {
      if (ev.pointerId === g.pointerId) interrupt({ type: 'pointer-cancel' });
    };
    const pressed = (ev: globalThis.PointerEvent): void => {
      interrupt({ type: 'press', button: ev.button });
    };
    const keyed = (ev: globalThis.KeyboardEvent): void => {
      if (!interrupt({ type: 'key', key: ev.key })) return;
      // Esc ends the drag only; the editor must not also see it.
      ev.preventDefault();
      ev.stopPropagation();
    };
    const blurred = (): void => {
      interrupt({ type: 'blur' });
    };
    const lost = (): void => {
      if (g.started) interrupt({ type: 'capture-lost' });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancelled);
    window.addEventListener('pointerdown', pressed, true);
    window.addEventListener('keydown', keyed, true);
    window.addEventListener('blur', blurred);
    el.addEventListener('lostpointercapture', lost);
    endGestureRef.current = finish;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const target = e.target;
    if (!(target instanceof HTMLElement) || target.getAttribute('role') !== 'tab') return;
    const id = target.dataset['tabId'];
    // T15: the context-menu key or Shift+F10; the menu event that may follow is not a second ask.
    if (id !== undefined && tabMenuKeyAction(e, id, target.getBoundingClientRect(), onTabMenu)) {
      e.preventDefault();
      swallowMenuRef.current = true;
      return;
    }
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
    const action = stripKey(e.key, items.indexOf(target), items.length);
    if (action === null) return;
    e.preventDefault();
    if ('focus' in action) items[action.focus]?.focus();
    else if (id !== undefined) onActivate(id);
  };

  return (
    <div
      className="tabstrip"
      data-testid="tab-strip"
      onWheel={onWheel}
      // T13: a double-click on the empty strip is a new tab.
      onDoubleClick={(e) => {
        const on = e.target instanceof Element ? e.target : null;
        if (on?.closest('.tab, .tab-add, .tab-scroll, .tooltip') === null) onNew();
      }}
    >
      {shown.left && <ScrollButton side="left" onPress={() => scrollBy('left')} />}
      <div
        ref={tabsRef}
        className={drag === null ? 'tabs' : 'tabs is-reordering'}
        role="tablist"
        aria-label="Open drawings"
        onKeyDown={onKeyDown}
        onScroll={measure}
      >
        {tabs.map((tab, index) => {
          const lifted = drag !== null && drag.id === tab.id;
          const shift = drag === null ? undefined : (drag.shifts[index] ?? 0);
          return (
            <div
              key={tab.id}
              id={tabDomId(tab.id)}
              className={lifted ? 'tab is-dragging' : 'tab'}
              role="tab"
              aria-selected={tab.id === activeId}
              aria-label={tabName(tab)}
              tabIndex={tab.id === stop ? 0 : -1}
              data-testid="tab"
              data-tab-id={tab.id}
              data-marker={tab.marker}
              style={
                lifted
                  ? { transform: `translateX(${drag.lift}px)` }
                  : shift === undefined
                    ? undefined
                    : { transform: `translateX(${shift}px)` }
              }
              {...tipAttrs({ title: tab.label, help: tabHelp(tab) }, 'below')}
              onClick={() => {
                if (justDraggedRef.current) {
                  justDraggedRef.current = false;
                  return;
                }
                onActivate(tab.id);
              }}
              onPointerDown={(e) => onTabPress(index, tab.id, e)}
              onContextMenu={(e) => {
                if (swallowMenuRef.current) {
                  swallowMenuRef.current = false;
                  e.preventDefault();
                  return;
                }
                tabMenuMouseAction(tab.id, e, onTabMenu);
              }}
              // A middle press must not start the browser's autoscroll; the release closes the tab.
              onMouseDown={(e: MouseEvent) => {
                if (e.button === 1) e.preventDefault();
              }}
              onAuxClick={(e: MouseEvent) => {
                if (e.button !== 1) return;
                e.preventDefault();
                onClose(tab.id);
              }}
            >
              {tab.marker === 'dot' && <span className="tab-dot" aria-hidden="true" />}
              {(tab.marker === 'unavailable' || tab.marker === 'unkept') && (
                <span className="tab-warn" aria-hidden="true">
                  <svg className="icon icon-16" aria-hidden="true">
                    <use href="#warning" />
                  </svg>
                </span>
              )}
              <span className="tab-title">{tab.label}</span>
              <button
                type="button"
                className="tab-close"
                tabIndex={-1}
                aria-label={`Close ${tab.label} (Ctrl+W)`}
                data-testid="tab-close"
                {...tipAttrs(CLOSE_TIP, 'below')}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
              >
                <svg className="icon icon-16" aria-hidden="true">
                  <use href="#close" />
                </svg>
              </button>
            </div>
          );
        })}
        {drag !== null && drag.to !== drag.from && (
          <div className="tab-drop" style={{ left: drag.line }} aria-hidden="true" />
        )}
      </div>
      {shown.right && <ScrollButton side="right" onPress={() => scrollBy('right')} />}
      <button
        type="button"
        className="btn tab-add"
        aria-label="New tab (Ctrl+T)"
        data-testid="tab-add"
        {...tipAttrs(NEW_TIP, 'below')}
        onClick={onNew}
      >
        <svg className="icon icon-20" aria-hidden="true">
          <use href="#add" />
        </svg>
      </button>
      <TooltipHost />
    </div>
  );
}
