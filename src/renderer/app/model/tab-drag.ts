// The pure rules of the tab strip's interactions (SPEC-app-shell.md T13 reorder, T14 overflow,
// T15's trigger). No DOM and no timers: the view measures, passes numbers in and applies what comes
// back. Every x here is a *content* coordinate of the scrolling strip (`offsetLeft` of a tab, or a
// pointer turned by `contentX`), so a scrolled strip needs no special case in the rules.

/** T13: the editor's drag threshold. A press moved this far or less is still a click. */
export const DRAG_THRESHOLD_PX = 4;

/** One tab's place in the strip: `offsetLeft` and `offsetWidth`. */
export interface Slot {
  readonly left: number;
  readonly width: number;
}

/** T13: a press at `startX` has become a drag once the pointer is past the threshold sideways. */
export const dragStarts = (startX: number, x: number): boolean =>
  Math.abs(x - startX) > DRAG_THRESHOLD_PX;

/** A pointer at client `clientX` in a strip whose left edge is at `stripLeft` and is scrolled. */
export const contentX = (clientX: number, stripLeft: number, scrollLeft: number): number =>
  clientX - stripLeft + scrollLeft;

const gapOf = (slots: readonly Slot[]): number => {
  const [a, b] = slots;
  return a === undefined || b === undefined ? 0 : b.left - (a.left + a.width);
};

/**
 * Where the left edge of the dragged tab `from` is drawn while the pointer is at `pointerX` and the
 * tab was grabbed `grab` px from its left edge. Clamped to the tabs' own range: no drop outside.
 */
export function liftLeft(
  slots: readonly Slot[],
  from: number,
  pointerX: number,
  grab: number,
): number {
  const slot = slots[from];
  const first = slots[0];
  const last = slots[slots.length - 1];
  const left = pointerX - grab;
  if (slot === undefined || first === undefined || last === undefined) return left;
  return Math.min(Math.max(left, first.left), last.left + last.width - slot.width);
}

/**
 * T13: the index the dragged tab `from` ends at when its centre is at `centre`: it has passed every
 * other tab whose centre is at or left of its own. Far left is 0 and far right the last index.
 */
export function dropIndex(slots: readonly Slot[], from: number, centre: number): number {
  if (slots[from] === undefined) return from;
  let to = 0;
  slots.forEach((s, i) => {
    if (i !== from && s.left + s.width / 2 <= centre) to += 1;
  });
  return to;
}

/**
 * T13: how far each tab shifts sideways so the dragged tab `from` has room at `to` (0 for the
 * dragged tab itself and for tabs that do not move). Tabs it passes move by its width plus a gap.
 */
export function makeRoom(slots: readonly Slot[], from: number, to: number): number[] {
  const dragged = slots[from];
  const none = slots.map(() => 0);
  if (dragged === undefined || slots[to] === undefined || from === to) return none;
  const by = dragged.width + gapOf(slots);
  return slots.map((_, i) => {
    if (from < to && i > from && i <= to) return -by;
    if (from > to && i >= to && i < from) return by;
    return 0;
  });
}

/**
 * T13: the centre x of the 2 px accent line that shows the drop position: in the gap before the
 * first other tab when `to` is 0, else in the gap after the other tab that will precede it. Kept
 * inside the tabs (1 px from either end): a line poking out of the tab list would widen its scroll
 * width by a pixel or two at the ends, which shows the scroll buttons, shrinks the tabs, and so
 * hides the buttons again, an endless update loop.
 */
export function dropLineX(slots: readonly Slot[], from: number, to: number): number {
  const others = slots.filter((_, i) => i !== from);
  const half = gapOf(slots) / 2;
  const before = others[to - 1];
  const gap = (): number => {
    if (before !== undefined) return before.left + before.width + half;
    const first = others[0] ?? slots[0];
    return first === undefined ? 0 : first.left - half;
  };
  const x = gap();
  const start = slots[0];
  const end = slots[slots.length - 1];
  if (start === undefined || end === undefined) return x;
  return Math.min(Math.max(x, start.left + 1), end.left + end.width - 1);
}

/** What can end a drag without a drop (T13). */
export type DragInterruption =
  | { readonly type: 'key'; readonly key: string }
  | { readonly type: 'press'; readonly button: number }
  | { readonly type: 'capture-lost' }
  | { readonly type: 'pointer-cancel' }
  | { readonly type: 'blur' };

/** T13: Esc, a right press, capture loss (also a pointer cancel) and blur cancel; nothing else. */
export function cancelsDrag(e: DragInterruption): boolean {
  switch (e.type) {
    case 'key':
      return e.key === 'Escape';
    case 'press':
      return e.button === 2;
    default:
      return true;
  }
}

// ---- overflow (T14) -------------------------------------------------------------------------

/** The strip's scroll geometry; `reserved` is the width of the scroll buttons now shown. */
export interface ScrollMetrics {
  readonly scrollLeft: number;
  readonly clientWidth: number;
  readonly scrollWidth: number;
  readonly reserved: number;
}

/** T14: the scrollLeft that brings the tab `[tabLeft, tabRight]` into a view `viewWidth` wide. */
export function revealLeft(
  tabLeft: number,
  tabRight: number,
  scrollLeft: number,
  viewWidth: number,
): number {
  if (tabLeft < scrollLeft || tabRight - tabLeft > viewWidth) return Math.max(0, tabLeft);
  if (tabRight > scrollLeft + viewWidth) return Math.max(0, tabRight - viewWidth);
  return scrollLeft;
}

/**
 * T14: the scroll buttons shown. Only while the tabs overflow, and each only on a side with more
 * tabs. The room of buttons already shown is added back before judging the overflow, so showing a
 * button can never be what makes the overflow go away (no flicker).
 */
export function scrollButtons(m: ScrollMetrics): { left: boolean; right: boolean } {
  if (m.scrollWidth <= m.clientWidth + m.reserved) return { left: false, right: false };
  return {
    left: m.scrollLeft > 0,
    right: m.scrollLeft + m.clientWidth < m.scrollWidth - 1,
  };
}

/** T14: a press on a scroll button moves half the visible width, within the scrollable range. */
export function chevronTarget(
  side: 'left' | 'right',
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
): number {
  const step = clientWidth / 2;
  const target = side === 'left' ? scrollLeft - step : scrollLeft + step;
  return Math.min(Math.max(target, 0), Math.max(0, scrollWidth - clientWidth));
}

const LINE_PX = 16;

/** T14: the sideways scroll of a wheel event: a vertical wheel scrolls the strip sideways. */
export function wheelScroll(
  e: { deltaX: number; deltaY: number; deltaMode: number },
  clientWidth: number,
): number {
  const delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (e.deltaMode === 1) return delta * LINE_PX;
  if (e.deltaMode === 2) return delta * clientWidth;
  return delta;
}

// ---- the tab menu's trigger (T15, CM4) --------------------------------------------------------

/** What `tabMenuTrigger` reads of a keydown. */
export interface MenuKeyEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

/**
 * T15: the context-menu key or Shift+F10 on a focused tab opens the tab menu under the tab (`rect`
 * is the tab's box in content CSS px). A lone F10 is the host's menu key (M4); any Ctrl, Alt or
 * Meta combination is not a trigger. A right-click is handled by the view (`at: null`).
 */
export function tabMenuTrigger(
  e: MenuKeyEvent,
  rect: { left: number; bottom: number },
): { at: { x: number; y: number } } | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  const opens = e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey);
  return opens ? { at: { x: rect.left, y: rect.bottom } } : null;
}
