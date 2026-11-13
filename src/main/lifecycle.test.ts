// F13 close, RC5 shutdown, SS10 and the one quit flush (SPEC-app-shell.md) with fake windows and a
// fake session chain: the one close path (TB21): N5 waits for the session chain to be empty, then
// deletes the discarded records on the empty chain and closes once; a gone renderer or a close
// after `session-end` (R24) closes at once, without the prompt, the wait or the deletion; and quit
// flushes settings and the session store once.
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { guardClose, installQuitFlush } from './lifecycle';

function fakeWindow() {
  const win = Object.assign(new EventEmitter(), {
    closes: 0,
    destroyed: false,
    sent: [] as unknown[],
    close() {
      win.closes++;
      const event = { prevented: false, preventDefault: () => (event.prevented = true) };
      win.emit('close', event);
      if (!event.prevented) win.destroyed = true;
      return event;
    },
    isDestroyed: () => win.destroyed,
  });
  const webContents = Object.assign(new EventEmitter(), {
    crashed: false,
    send: (_channel: string, value: unknown) => win.sent.push(value),
    isCrashed: () => webContents.crashed,
  });
  return Object.assign(win, { webContents });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * A fake of the session store's chain (TB9): tasks run one after another in arrival order; a
 * failing task is caught (as `enqueue` does) and the next one runs; `busy` while one is queued or
 * running; `idle` settles once every task queued so far has run; `deleteDiscarded` is a task.
 */
function fakeChain() {
  let chain: Promise<unknown> = Promise.resolve();
  let queued = 0;
  const events: string[] = [];
  const add = (label: string, task: () => Promise<unknown> = () => Promise.resolve()) => {
    queued++;
    const run = chain
      .then(task)
      .then(
        () => events.push(label),
        () => events.push(`${label} failed`),
      )
      .finally(() => {
        queued--;
      });
    chain = run;
    return run.then(() => undefined);
  };
  return {
    events,
    add,
    idle: vi.fn(() => chain.then(() => undefined)),
    busy: () => queued > 0,
    deleteDiscarded: vi.fn(() => add('delete discarded')),
  };
}

function setup() {
  const win = fakeWindow();
  const closing = vi.fn();
  const sessionChain = fakeChain();
  const guard = guardClose(win, { closing, sessionChain });
  return { win, guard, closing, sessionChain };
}

/** Lets every settled promise run its handlers (a chain of a few dozen steps). */
async function settle(): Promise<void> {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
const never = () => new Promise<void>(() => undefined);

describe('guardClose (F13, RC5, SS10)', () => {
  it('before the first N1 a close goes ahead at once', () => {
    const { win, closing } = setup();
    expect(win.close().prevented).toBe(false);
    expect(closing).toHaveBeenCalledTimes(1);
    expect(win.sent).toEqual([]);
  });

  it('after N1 a close is handed to the renderer (close-requested), every time', () => {
    const { win, guard, closing } = setup();
    guard.rendererReady();
    expect(win.close().prevented).toBe(true);
    expect(win.close().prevented).toBe(true);
    expect(win.sent).toEqual([{ type: 'close-requested' }, { type: 'close-requested' }]);
    expect(closing).not.toHaveBeenCalled();
  });

  it('R37: with a close queue the request goes to it (behind earlier opens), not straight to the renderer', () => {
    const requestClose = vi.fn();
    const make = () => {
      const win = fakeWindow();
      const ports = {
        closing: vi.fn(),
        sessionChain: fakeChain(),
        requestClose,
      };
      return { win, guard: guardClose(win, ports) };
    };
    const early = make();
    expect(early.win.close().prevented).toBe(false); // before N1: closes at once, nothing queued
    expect(requestClose).not.toHaveBeenCalled();
    const ready = make();
    ready.guard.rendererReady();
    expect(ready.win.close().prevented).toBe(true);
    expect(requestClose).toHaveBeenCalledTimes(1);
    expect(ready.win.sent).toEqual([]);
  });

  it('N5 with an idle session chain deletes the discarded records and closes once', async () => {
    const { win, guard, closing, sessionChain } = setup();
    guard.rendererReady();
    guard.closeOk();
    guard.closeOk(); // a duplicate answer does not close twice
    await vi.waitFor(() => expect(win.destroyed).toBe(true));
    expect(win.closes).toBe(1);
    expect(closing).toHaveBeenCalledTimes(1);
    expect(sessionChain.events).toEqual(['delete discarded']);
  });

  it('SS10: N5 with session writes in flight waits for every one, deletes the discarded records on the empty chain, then closes once', async () => {
    const { win, guard, closing, sessionChain } = setup();
    guard.rendererReady();
    const slow = deferred();
    void sessionChain.add('record', () => slow.promise);
    void sessionChain.add('auto-save');
    void sessionChain.add('index');
    guard.closeOk();
    guard.closeOk(); // a duplicate answer does not drain or close twice
    await settle();
    expect(win.destroyed).toBe(false);
    expect(sessionChain.deleteDiscarded).not.toHaveBeenCalled();
    slow.resolve();
    await vi.waitFor(() => expect(win.destroyed).toBe(true));
    expect(sessionChain.events).toEqual(['record', 'auto-save', 'index', 'delete discarded']);
    expect(sessionChain.deleteDiscarded).toHaveBeenCalledTimes(1);
    expect(win.closes).toBe(1);
    expect(closing).toHaveBeenCalledTimes(1);
  });

  it('SS10: a write that arrives while the chain drains is waited for too', async () => {
    const { win, guard, sessionChain } = setup();
    guard.rendererReady();
    const first = deferred();
    const late = deferred();
    void sessionChain.add('record', () => first.promise);
    guard.closeOk();
    await settle();
    void sessionChain.add('index', () => late.promise); // arrives after N5, behind the record
    first.resolve();
    await settle();
    expect(win.destroyed).toBe(false);
    expect(sessionChain.deleteDiscarded).not.toHaveBeenCalled();
    late.resolve();
    await vi.waitFor(() => expect(win.destroyed).toBe(true));
    expect(sessionChain.events).toEqual(['record', 'index', 'delete discarded']);
  });

  it('SS10: a write queued behind the deletion is waited for before the close', async () => {
    const win = fakeWindow();
    const sessionChain = fakeChain();
    const late = deferred();
    sessionChain.deleteDiscarded.mockImplementation(() => {
      const deleting = sessionChain.add('delete discarded');
      void sessionChain.add('index', () => late.promise);
      return deleting;
    });
    const guard = guardClose(win, {
      closing: vi.fn(),
      sessionChain,
    });
    guard.rendererReady();
    guard.closeOk();
    await vi.waitFor(() => expect(sessionChain.events).toEqual(['delete discarded']));
    await settle();
    expect(win.destroyed).toBe(false);
    late.resolve();
    await vi.waitFor(() => expect(win.destroyed).toBe(true));
    expect(sessionChain.events).toEqual(['delete discarded', 'index']);
  });

  it('SS10: a failing session write, or a failing deletion, does not block the close', async () => {
    const { win, guard, sessionChain } = setup();
    guard.rendererReady();
    sessionChain.deleteDiscarded.mockImplementation(() => Promise.reject(new Error('EPERM')));
    void sessionChain.add('record', () => Promise.reject(new Error('ENOSPC')));
    void sessionChain.add('index');
    guard.closeOk();
    await vi.waitFor(() => expect(win.destroyed).toBe(true));
    expect(sessionChain.events).toEqual(['record failed', 'index']);
    expect(win.closes).toBe(1);
  });

  it('SS10: a session chain whose idle rejects still lets the window close', async () => {
    const win = fakeWindow();
    const sessionChain = fakeChain();
    void sessionChain.add('record', never);
    sessionChain.idle.mockImplementation(() => Promise.reject(new Error('broken')));
    const guard = guardClose(win, {
      closing: vi.fn(),
      sessionChain,
    });
    guard.rendererReady();
    guard.closeOk();
    await vi.waitFor(() => expect(win.destroyed).toBe(true));
  });

  it('a gone renderer: the close goes ahead at once, without the prompt, the session wait or a deletion', () => {
    const { win, guard, closing, sessionChain } = setup();
    guard.rendererReady();
    void sessionChain.add('record', never);
    win.webContents.emit('render-process-gone', {}, { reason: 'killed' });
    expect(win.close().prevented).toBe(false);
    expect(win.sent).toEqual([]);
    expect(closing).toHaveBeenCalledTimes(1);
    expect(sessionChain.idle).not.toHaveBeenCalled();
    expect(sessionChain.deleteDiscarded).not.toHaveBeenCalled();
  });

  it('a crashed renderer is treated the same', () => {
    const { win, guard } = setup();
    guard.rendererReady();
    win.webContents.crashed = true;
    expect(win.close().prevented).toBe(false);
  });

  const asking = () => {
    const event = { prevented: false, preventDefault: () => (event.prevented = true) };
    return event;
  };

  it('RC5: query-session-end sends flush-session and prevents nothing', () => {
    const { win, guard } = setup();
    guard.rendererReady();
    const event = asking();
    win.emit('query-session-end', event);
    expect(event.prevented).toBe(false);
    expect(win.sent).toEqual([{ type: 'flush-session' }]);
  });

  it('R24: query-session-end waits for nothing and touches neither chain nor the window', () => {
    const { win, guard, closing, sessionChain } = setup();
    guard.rendererReady();
    void sessionChain.add('record', never);
    win.emit('query-session-end', asking());
    expect(sessionChain.idle).not.toHaveBeenCalled();
    expect(sessionChain.deleteDiscarded).not.toHaveBeenCalled();
    expect(win.closes).toBe(0);
    expect(closing).not.toHaveBeenCalled();
  });

  it('R24: a close after query-session-end alone (shutdown cancelled) is an ordinary close', () => {
    const { win, guard, closing } = setup();
    guard.rendererReady();
    win.emit('query-session-end', asking());
    win.sent.length = 0;
    expect(win.close().prevented).toBe(true);
    expect(win.sent).toEqual([{ type: 'close-requested' }]);
    expect(closing).not.toHaveBeenCalled();
  });

  it('R24: session-end, then the close, goes ahead at once without the prompt or the session wait', () => {
    const { win, guard, closing, sessionChain } = setup();
    guard.rendererReady();
    void sessionChain.add('record', never);
    win.emit('session-end', {});
    expect(win.close().prevented).toBe(false);
    expect(win.sent).toEqual([]);
    expect(closing).toHaveBeenCalledTimes(1);
    expect(sessionChain.idle).not.toHaveBeenCalled();
    expect(sessionChain.deleteDiscarded).not.toHaveBeenCalled();
  });

  it('R24: a close after session-end goes ahead even while an N5 drain is waiting', async () => {
    const { win, guard, sessionChain } = setup();
    guard.rendererReady();
    void sessionChain.add('record', never);
    guard.closeOk();
    await settle();
    win.emit('session-end', {});
    expect(win.close().prevented).toBe(false);
    expect(win.closes).toBe(1);
  });

  it('R24: query-session-end, session-end, close: goes ahead; only the flush was sent', () => {
    const { win, guard, closing } = setup();
    guard.rendererReady();
    win.emit('query-session-end', asking());
    win.emit('session-end', {});
    expect(win.close().prevented).toBe(false);
    expect(win.sent).toEqual([{ type: 'flush-session' }]);
    expect(closing).toHaveBeenCalledTimes(1);
  });
});

describe('installQuitFlush (settings and the session store, once)', () => {
  function fakeApp() {
    const app = Object.assign(new EventEmitter(), {
      quits: 0,
      quit() {
        app.quits++;
        const event = { prevented: false, preventDefault: () => (event.prevented = true) };
        app.emit('will-quit', event);
        return event;
      },
    });
    return app;
  }

  it('nothing pending: quit goes ahead', () => {
    const app = fakeApp();
    const flush = vi.fn(() => Promise.resolve());
    installQuitFlush(app, { pending: () => false, flush, log: vi.fn() });
    expect(app.quit().prevented).toBe(false);
    expect(flush).not.toHaveBeenCalled();
  });

  it('pending: quit waits for one flush, a second will-quit meanwhile does not flush again', async () => {
    const app = fakeApp();
    const gate = deferred();
    const flush = vi.fn(() => gate.promise);
    installQuitFlush(app, { pending: () => true, flush, log: vi.fn() });
    expect(app.quit().prevented).toBe(true);
    expect(app.quit().prevented).toBe(true);
    expect(flush).toHaveBeenCalledTimes(1);
    gate.resolve();
    await vi.waitFor(() => expect(app.quits).toBe(3));
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('a failing flush is logged and the app still quits', async () => {
    const app = fakeApp();
    const log = vi.fn();
    installQuitFlush(app, {
      pending: () => true,
      flush: () => Promise.reject(new Error('EBUSY')),
      log,
    });
    app.quit();
    await vi.waitFor(() => expect(app.quits).toBe(2));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('EBUSY'));
  });
});
