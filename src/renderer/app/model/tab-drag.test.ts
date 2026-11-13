// TB25: the pure rules of the tab strip's interactions (SPEC-app-shell.md T13 reorder, T14
// overflow, T15's trigger): the drag threshold, where a drag drops, who makes room, what cancels,
// the scroll rules and the keys that open the tab menu.
import { describe, expect, it } from 'vitest';
import {
  DRAG_THRESHOLD_PX,
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
  type Slot,
} from './tab-drag';

// Four tabs of 100 with a gap of 4: [0,100] [104,204] [208,308] [312,412].
const slots: Slot[] = [0, 1, 2, 3].map((i) => ({ left: i * 104, width: 100 }));

describe('the drag threshold (T13)', () => {
  it('is the editor drag threshold, 4 px', () => {
    expect(DRAG_THRESHOLD_PX).toBe(4);
  });
  it('a press moved 4 px or less is still a click; past 4 px sideways starts a drag', () => {
    expect(dragStarts(100, 100)).toBe(false);
    expect(dragStarts(100, 104)).toBe(false);
    expect(dragStarts(100, 96)).toBe(false);
    expect(dragStarts(100, 105)).toBe(true);
    expect(dragStarts(100, 95)).toBe(true);
  });
});

describe('contentX: a pointer in the scrolled strip', () => {
  it('adds the scroll offset and removes the strip origin', () => {
    expect(contentX(250, 50, 0)).toBe(200);
    expect(contentX(250, 50, 300)).toBe(500);
  });
});

describe('liftLeft: the dragged tab follows the pointer inside the strip', () => {
  it('keeps the grab offset', () => {
    // tab 1 grabbed 30 px from its left edge; pointer at 200
    expect(liftLeft(slots, 1, 200, 30)).toBe(170);
  });
  it('is clamped to the first and the last tab slot (no drop outside)', () => {
    expect(liftLeft(slots, 1, -500, 30)).toBe(0);
    expect(liftLeft(slots, 1, 9000, 30)).toBe(312);
  });
});

describe('dropIndex (T13): the tab ends where its centre has passed the others', () => {
  it('stays put while its centre is between the neighbours centres', () => {
    expect(dropIndex(slots, 1, 154)).toBe(1);
    expect(dropIndex(slots, 1, 100)).toBe(1);
    expect(dropIndex(slots, 1, 200)).toBe(1);
  });
  it('moves right when the centre passes the next tab centre', () => {
    expect(dropIndex(slots, 1, 258)).toBe(2);
    expect(dropIndex(slots, 1, 363)).toBe(3);
  });
  it('moves left when the centre passes the previous tab centre', () => {
    expect(dropIndex(slots, 3, 257)).toBe(2);
    expect(dropIndex(slots, 3, 49)).toBe(0);
  });
  it('both ends: far left is index 0, far right the last index', () => {
    expect(dropIndex(slots, 2, -1000)).toBe(0);
    expect(dropIndex(slots, 1, 100000)).toBe(3);
    expect(dropIndex(slots, 0, 100000)).toBe(3);
    expect(dropIndex(slots, 3, -1000)).toBe(0);
  });
  it('equal widths: a tab pushed to the far left edge reaches the front, as to the far right the end', () => {
    // TB32 found this by looking at the shot: lifted to the first slot, the centre of a tab as wide
    // as the first one is exactly the first tab's centre, and a tie must count as passed on the
    // left too, or no tab can ever be dropped at the front.
    for (const from of [1, 2, 3]) {
      expect(dropIndex(slots, from, liftLeft(slots, from, -500, 30) + 50)).toBe(0);
    }
    for (const from of [0, 1, 2]) {
      expect(dropIndex(slots, from, liftLeft(slots, from, 9000, 30) + 50)).toBe(3);
    }
  });
  it('a tie with a neighbour on the left counts as passed, one on the right likewise', () => {
    expect(dropIndex(slots, 1, 50)).toBe(0);
    expect(dropIndex(slots, 2, 154)).toBe(1);
    expect(dropIndex(slots, 1, 258)).toBe(2);
  });
  it('one tab, or an index that is no tab, drops where it is', () => {
    expect(dropIndex([{ left: 0, width: 100 }], 0, 500)).toBe(0);
    expect(dropIndex(slots, 7, 0)).toBe(7);
  });
  it('works in a scrolled strip: slots and pointer are both content coordinates', () => {
    // The strip is scrolled by 300 and its origin is at client x 50: client 380 is content 630.
    const wide: Slot[] = Array.from({ length: 10 }, (_, i) => ({ left: i * 104, width: 100 }));
    const x = contentX(380, 50, 300);
    expect(x).toBe(630);
    const left = liftLeft(wide, 2, x, 20);
    expect(dropIndex(wide, 2, left + 50)).toBe(5);
    // Without the scroll offset the same pointer would wrongly land near the start.
    const wrong = liftLeft(wide, 2, contentX(380, 50, 0), 20);
    expect(dropIndex(wide, 2, wrong + 50)).toBe(2);
  });
});

describe('makeRoom: who shifts, and by how much', () => {
  it('moving right shifts the tabs in between left by the dragged width plus the gap', () => {
    expect(makeRoom(slots, 0, 2)).toEqual([0, -104, -104, 0]);
  });
  it('moving left shifts them right', () => {
    expect(makeRoom(slots, 3, 1)).toEqual([0, 104, 104, 0]);
  });
  it('no move, or an index outside the list, shifts nothing', () => {
    expect(makeRoom(slots, 1, 1)).toEqual([0, 0, 0, 0]);
    expect(makeRoom(slots, 9, 0)).toEqual([0, 0, 0, 0]);
    expect(makeRoom(slots, 0, 9)).toEqual([0, 0, 0, 0]);
  });
  it('uses the dragged tab own width, so unequal tabs close the gap exactly', () => {
    const odd: Slot[] = [
      { left: 0, width: 200 },
      { left: 204, width: 96 },
      { left: 304, width: 96 },
    ];
    expect(makeRoom(odd, 0, 1)).toEqual([0, -204, 0]);
    expect(makeRoom(odd, 2, 0)).toEqual([100, 100, 0]);
  });
});

describe('dropLineX: the centre of the 2 px accent line, in the gap between the others', () => {
  it('at the front it sits before the first other tab, inside the tabs', () => {
    // the gap's centre is at -2; the 2 px line is kept inside the content (from x = 1, 0 to 2)
    expect(dropLineX(slots, 2, 0)).toBe(1);
  });
  it('in the middle it sits after the tab it follows', () => {
    // the others, with tab 0 lifted: 104.., 208.., 312..; index 1 is after the first of them
    expect(dropLineX(slots, 0, 1)).toBe(206);
  });
  it('at the end it sits after the last other tab', () => {
    expect(dropLineX(slots, 3, 3)).toBe(310);
  });
  it('never pokes out of the tabs: the line stays inside the content, so it adds no overflow', () => {
    // the gap's centre would be 414 (the content ends at 412): the 2 px line ends at 412
    expect(dropLineX(slots, 0, 3)).toBe(411);
    const last = slots[slots.length - 1] as Slot;
    for (let from = 0; from < slots.length; from += 1) {
      for (let to = 0; to < slots.length; to += 1) {
        const x = dropLineX(slots, from, to);
        expect(x - 1, `${from}->${to}`).toBeGreaterThanOrEqual(0);
        expect(x + 1, `${from}->${to}`).toBeLessThanOrEqual(last.left + last.width);
      }
    }
  });
  it('a single tab has its own slot', () => {
    expect(dropLineX([{ left: 10, width: 100 }], 0, 0)).toBe(11);
  });
});

describe('cancelsDrag (T13): Esc, a right press, capture loss, blur', () => {
  it('Escape cancels, other keys do not', () => {
    expect(cancelsDrag({ type: 'key', key: 'Escape' })).toBe(true);
    expect(cancelsDrag({ type: 'key', key: 'Enter' })).toBe(false);
    expect(cancelsDrag({ type: 'key', key: 'a' })).toBe(false);
  });
  it('a right press cancels; a left or middle press does not', () => {
    expect(cancelsDrag({ type: 'press', button: 2 })).toBe(true);
    expect(cancelsDrag({ type: 'press', button: 0 })).toBe(false);
    expect(cancelsDrag({ type: 'press', button: 1 })).toBe(false);
  });
  it('capture loss, pointer cancel and blur cancel', () => {
    expect(cancelsDrag({ type: 'capture-lost' })).toBe(true);
    expect(cancelsDrag({ type: 'pointer-cancel' })).toBe(true);
    expect(cancelsDrag({ type: 'blur' })).toBe(true);
  });
});

describe('revealLeft (T14): the active or new tab scrolls into view', () => {
  it('leaves a tab that is fully visible alone', () => {
    expect(revealLeft(100, 300, 50, 400)).toBe(50);
  });
  it('scrolls left to a tab cut off on the left', () => {
    expect(revealLeft(100, 200, 150, 400)).toBe(100);
  });
  it('scrolls right to a tab cut off on the right', () => {
    expect(revealLeft(500, 700, 0, 400)).toBe(300);
  });
  it('never scrolls below 0 and shows the left edge when the tab is wider than the view', () => {
    expect(revealLeft(0, 100, 30, 400)).toBe(0);
    expect(revealLeft(50, 650, 0, 400)).toBe(50);
  });
});

describe('scrollButtons (T14): shown only while it overflows, only on a side with more tabs', () => {
  const m = (scrollLeft: number, clientWidth: number, scrollWidth: number, reserved = 0) => ({
    scrollLeft,
    clientWidth,
    scrollWidth,
    reserved,
  });
  it('no overflow, no buttons', () => {
    expect(scrollButtons(m(0, 800, 800))).toEqual({ left: false, right: false });
    expect(scrollButtons(m(0, 800, 600))).toEqual({ left: false, right: false });
  });
  it('overflowing at the start: only the right button', () => {
    expect(scrollButtons(m(0, 800, 1100))).toEqual({ left: false, right: true });
  });
  it('overflowing in the middle: both', () => {
    expect(scrollButtons(m(100, 800, 1100))).toEqual({ left: true, right: true });
  });
  it('overflowing at the end: only the left button', () => {
    expect(scrollButtons(m(300, 800, 1100))).toEqual({ left: true, right: false });
    expect(scrollButtons(m(299.6, 800, 1100))).toEqual({ left: true, right: false });
  });
  it('the room of buttons already shown is counted, so a button never makes its own overflow vanish', () => {
    // 776 px visible with one 24 px button: the tabs need 790, which fits in 800: no overflow.
    expect(scrollButtons(m(0, 776, 790, 24))).toEqual({ left: false, right: false });
    expect(scrollButtons(m(0, 776, 810, 24))).toEqual({ left: false, right: true });
  });
});

describe('chevronTarget: half a view per press, clamped', () => {
  it('moves by half the visible width', () => {
    expect(chevronTarget('right', 100, 800, 2000)).toBe(500);
    expect(chevronTarget('left', 500, 800, 2000)).toBe(100);
  });
  it('is clamped to the ends', () => {
    expect(chevronTarget('left', 100, 800, 2000)).toBe(0);
    expect(chevronTarget('right', 1000, 800, 2000)).toBe(1200);
  });
});

describe('wheelScroll', () => {
  it('a vertical wheel scrolls the strip sideways', () => {
    expect(wheelScroll({ deltaX: 0, deltaY: 100, deltaMode: 0 }, 800)).toBe(100);
    expect(wheelScroll({ deltaX: 0, deltaY: -100, deltaMode: 0 }, 800)).toBe(-100);
  });
  it('a sideways wheel (touchpad) scrolls as it is', () => {
    expect(wheelScroll({ deltaX: 40, deltaY: 3, deltaMode: 0 }, 800)).toBe(40);
  });
  it('lines and pages are converted to pixels', () => {
    expect(wheelScroll({ deltaX: 0, deltaY: 3, deltaMode: 1 }, 800)).toBe(48);
    expect(wheelScroll({ deltaX: 0, deltaY: 1, deltaMode: 2 }, 800)).toBe(800);
  });
});

describe('tabMenuTrigger (T15, CM4): the context-menu key and Shift+F10', () => {
  const key = (
    k: string,
    mods: Partial<Record<'shift' | 'ctrl' | 'alt' | 'meta', boolean>> = {},
  ) => ({
    key: k,
    shiftKey: mods.shift === true,
    ctrlKey: mods.ctrl === true,
    altKey: mods.alt === true,
    metaKey: mods.meta === true,
  });
  const rect = { left: 120, bottom: 36 };
  it('the context-menu key opens the menu under the tab', () => {
    expect(tabMenuTrigger(key('ContextMenu'), rect)).toEqual({ at: { x: 120, y: 36 } });
  });
  it('Shift+F10 opens it under the tab', () => {
    expect(tabMenuTrigger(key('F10', { shift: true }), rect)).toEqual({ at: { x: 120, y: 36 } });
  });
  it('a lone F10 is the host menu key (M4), not the tab menu', () => {
    expect(tabMenuTrigger(key('F10'), rect)).toBeNull();
  });
  it('any Ctrl, Alt or Meta combination is not a trigger', () => {
    expect(tabMenuTrigger(key('F10', { shift: true, ctrl: true }), rect)).toBeNull();
    expect(tabMenuTrigger(key('F10', { shift: true, alt: true }), rect)).toBeNull();
    expect(tabMenuTrigger(key('ContextMenu', { meta: true }), rect)).toBeNull();
    expect(tabMenuTrigger(key('ContextMenu', { ctrl: true }), rect)).toBeNull();
  });
  it('other keys are not triggers', () => {
    expect(tabMenuTrigger(key('Enter'), rect)).toBeNull();
    expect(tabMenuTrigger(key('m'), rect)).toBeNull();
  });
});
