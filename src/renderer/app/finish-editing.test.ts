// F4a (SPEC-app-shell.md, R17; editor R48): the host's finishEditing port over a fake controller
// and a fake editor box. The real box, blur and IME composition are e2e/app-draft-close.spec.ts.
import { describe, expect, it } from 'vitest';
import type { EditorCommand, EditorEvent } from '../editor';
import {
  createFinishEditing,
  createFinishEditingNow,
  trackComposition,
  type EditorBox,
} from './finish-editing';

/** A controller whose label / text editor is open until `close()`; `close` emits like the store. */
function fakeEditor(open: boolean) {
  let editing = open;
  const listeners = new Set<(e: EditorEvent) => void>();
  const order: string[] = [];
  return {
    order,
    listeners,
    controller: {
      canRun: (cmd: EditorCommand): boolean => cmd === 'focus-name-field' && !editing,
      subscribe(listener: (e: EditorEvent) => void) {
        order.push('subscribe');
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    /** The editor commits and closes: `busy` as the store emits it when idle changes. */
    close() {
      editing = false;
      for (const l of [...listeners]) l({ type: 'busy' });
    },
    /** Another change while the editor stays open (an IME keystroke reaching the model). */
    other() {
      for (const l of [...listeners]) l({ type: 'selection' });
    },
  };
}

/** A box: `onBlur` is what a real blur event does (the TextBox's handler). */
function fakeBox(order: string[], focused: boolean, onBlur: () => void): EditorBox {
  const target = new EventTarget();
  target.addEventListener('blur', onBlur);
  return {
    blur() {
      order.push('blur()');
      if (focused) {
        focused = false;
        target.dispatchEvent(new Event('blur'));
      }
    },
    dispatchEvent(event: Event) {
      order.push(`dispatch ${event.type}`);
      return target.dispatchEvent(event);
    },
  };
}

const settled = async (p: Promise<void>): Promise<boolean> => {
  let done = false;
  void p.then(() => {
    done = true;
  });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  return done;
};

describe('finishEditing', () => {
  it('no editor open: resolves at once, no box looked up, no subscription', async () => {
    const e = fakeEditor(false);
    let looked = false;
    const finish = createFinishEditing(e.controller, () => {
      looked = true;
      return null;
    });
    await finish();
    expect(looked).toBe(false);
    expect(e.order).toEqual([]);
  });

  it('an open editor: subscribes before the blur, which commits; then unsubscribes', async () => {
    const e = fakeEditor(true);
    const box = fakeBox(e.order, true, () => e.close());
    await createFinishEditing(e.controller, () => box)();
    expect(e.order).toEqual(['subscribe', 'blur()']);
    expect(e.listeners.size).toBe(0);
  });

  it('the box not focused (page without focus): its blur handler runs through a blur event', async () => {
    const e = fakeEditor(true);
    const box = fakeBox(e.order, false, () => e.close());
    await createFinishEditing(e.controller, () => box)();
    expect(e.order).toEqual(['subscribe', 'blur()', 'dispatch blur']);
    expect(e.listeners.size).toBe(0);
  });

  it('IME: a blur during a composition waits (no timeout) until the editor closes', async () => {
    const e = fakeEditor(true);
    const box = fakeBox(e.order, true, () => undefined); // the commit waits for compositionend
    const done = createFinishEditing(e.controller, () => box)();
    expect(await settled(done)).toBe(false);
    e.other();
    expect(await settled(done)).toBe(false);
    e.close(); // compositionend: reconciled, then the waiting commit
    expect(await settled(done)).toBe(true);
    expect(e.listeners.size).toBe(0);
  });

  it('no box in the page while the editor is open: waits for the editor to close', async () => {
    const e = fakeEditor(true);
    const done = createFinishEditing(e.controller, () => null)();
    expect(await settled(done)).toBe(false);
    e.close();
    expect(await settled(done)).toBe(true);
  });
});

describe('finishEditingNow (R25: the shutdown flush; synchronous, never waits)', () => {
  it('no editor open: nothing happens, no box looked up', () => {
    const e = fakeEditor(false);
    let looked = false;
    createFinishEditingNow(
      e.controller,
      () => false,
      () => {
        looked = true;
        return null;
      },
    )();
    expect(looked).toBe(false);
    expect(e.order).toEqual([]);
  });

  it('an open editor is committed synchronously by the blur; nothing subscribes', () => {
    const e = fakeEditor(true);
    const box = fakeBox(e.order, true, () => e.close());
    createFinishEditingNow(
      e.controller,
      () => false,
      () => box,
    )();
    expect(e.order).toEqual(['blur()']);
    expect(e.controller.canRun('focus-name-field')).toBe(true);
    expect(e.listeners.size).toBe(0);
  });

  it('the box not focused: its blur handler runs through a blur event', () => {
    const e = fakeEditor(true);
    const box = fakeBox(e.order, false, () => e.close());
    createFinishEditingNow(
      e.controller,
      () => false,
      () => box,
    )();
    expect(e.order).toEqual(['blur()', 'dispatch blur']);
    expect(e.controller.canRun('focus-name-field')).toBe(true);
  });

  it('during an IME composition the editor is not touched at all', () => {
    const e = fakeEditor(true);
    let looked = false;
    createFinishEditingNow(
      e.controller,
      () => true,
      () => {
        looked = true;
        return null;
      },
    )();
    expect(looked).toBe(false);
    expect(e.order).toEqual([]);
    expect(e.listeners.size).toBe(0);
  });

  it('an editor that stays open (or no box) returns normally and leaves nothing behind', () => {
    const e = fakeEditor(true);
    const box = fakeBox(e.order, true, () => undefined);
    expect(() =>
      createFinishEditingNow(
        e.controller,
        () => false,
        () => box,
      )(),
    ).not.toThrow();
    expect(() =>
      createFinishEditingNow(
        e.controller,
        () => false,
        () => null,
      )(),
    ).not.toThrow();
    expect(e.listeners.size).toBe(0);
  });
});

describe('trackComposition', () => {
  it('follows compositionstart and compositionend on the target', () => {
    const target = new EventTarget();
    const composing = trackComposition(target);
    expect(composing()).toBe(false);
    target.dispatchEvent(new Event('compositionstart'));
    expect(composing()).toBe(true);
    target.dispatchEvent(new Event('compositionend'));
    expect(composing()).toBe(false);
  });

  it('without a target (no document) it is never composing', () => {
    expect(trackComposition(undefined)()).toBe(false);
  });
});
