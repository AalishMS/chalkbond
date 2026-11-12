// F13 close, RC2 normal close, RC5 shutdown and the one quit flush (SPEC-app-shell.md) with fake
// windows: a normal close waits for the recovery chain (N4 then N5), a gone renderer or a close after
// `session-end` (R24) closes without the prompt and never clears, and quit flushes settings and recovery once.
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

function setup() {
  const win = fakeWindow();
  const flush = deferred();
  const closing = vi.fn();
  const recoveryIdle = vi.fn(() => flush.promise);
  const guard = guardClose(win, { closing, recoveryIdle });
  return { win, guard, closing, recoveryIdle, flush };
}

describe('guardClose (F13, RC2, RC5)', () => {
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
      const ports = { closing: vi.fn(), recoveryIdle: () => Promise.resolve(), requestClose };
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

  it('N5 closes only after the recovery chain is idle (the N4 sent before it is done), once', async () => {
    const { win, guard, closing, recoveryIdle, flush } = setup();
    guard.rendererReady();
    guard.closeOk();
    guard.closeOk(); // a duplicate answer does not close twice
    await Promise.resolve();
    expect(recoveryIdle).toHaveBeenCalledTimes(1);
    expect(win.closes).toBe(0);
    flush.resolve();
    await vi.waitFor(() => expect(win.destroyed).toBe(true));
    expect(win.closes).toBe(1);
    expect(closing).toHaveBeenCalledTimes(1);
  });

  it('a failing recovery chain still lets the window close', async () => {
    const win = fakeWindow();
    const closing = vi.fn();
    const guard = guardClose(win, {
      closing,
      recoveryIdle: () => Promise.reject(new Error('disk')),
    });
    guard.rendererReady();
    guard.closeOk();
    await vi.waitFor(() => expect(win.destroyed).toBe(true));
  });

  it('a gone renderer: the close goes ahead without the prompt (recovery kept)', () => {
    const { win, guard, closing } = setup();
    guard.rendererReady();
    win.webContents.emit('render-process-gone', {}, { reason: 'killed' });
    expect(win.close().prevented).toBe(false);
    expect(win.sent).toEqual([]);
    expect(closing).toHaveBeenCalledTimes(1);
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

  it('RC5: query-session-end sends flush-recovery and prevents nothing', () => {
    const { win, guard } = setup();
    guard.rendererReady();
    const event = asking();
    win.emit('query-session-end', event);
    expect(event.prevented).toBe(false);
    expect(win.sent).toEqual([{ type: 'flush-recovery' }]);
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

  it('R24: session-end, then the close, goes ahead without the prompt', () => {
    const { win, guard, closing } = setup();
    guard.rendererReady();
    win.emit('session-end', {});
    expect(win.close().prevented).toBe(false);
    expect(win.sent).toEqual([]);
    expect(closing).toHaveBeenCalledTimes(1);
  });

  it('R24: query-session-end, session-end, close: goes ahead; only the flush was sent', () => {
    const { win, guard, closing } = setup();
    guard.rendererReady();
    win.emit('query-session-end', asking());
    win.emit('session-end', {});
    expect(win.close().prevented).toBe(false);
    expect(win.sent).toEqual([{ type: 'flush-recovery' }]);
    expect(closing).toHaveBeenCalledTimes(1);
  });
});

describe('installQuitFlush (settings and recovery, once)', () => {
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
