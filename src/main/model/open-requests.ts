// Open requests (SPEC-app-shell.md F11, F12, F13, T17; R37 amending R22): a path a launch asks to
// open (the first launch's command line, each second launch's, Open recent) waits until the
// renderer can take it. Waiting opens form a first-in-first-out queue of at most 20; the 21st is
// dropped and logged (LG1: no path). Before I7 has answered, the first waiting path is I7's `open`;
// between I7 and the renderer's first N1 (it listens for `main:event` from then on) every request
// waits and is delivered at that N1; afterwards each is delivered on arrival. Deliveries run one at
// a time in arrival order (each may wait for the session chain), and a close (F13's
// `close-requested`) waits in the same queue, so it is never sent before an earlier open. At most
// one close waits, as before. Pure: delivery, the real path and the registry lookup are injected.
import type { FocusTab } from '../../shared/ipc-types';
import { kindOfPath } from './file-refs';

/** R37: the most open requests that wait at once. */
export const MAX_WAITING_OPENS = 20;

export type OpenRequest = { kind: 'open'; path: string } | { kind: 'close' };

export interface OpenRequestPorts {
  /** Sends one request to the renderer; the next waits until the returned promise settles. */
  deliver(request: OpenRequest): Promise<void> | void;
  /** LG1: codes and counts only, never a path. */
  log(message: string): void;
}

export function createOpenRequests(initial: string | null, ports: OpenRequestPorts) {
  const queue: OpenRequest[] = initial === null ? [] : [{ kind: 'open', path: initial }];
  let started = false;
  let listening = false;
  let delivering = false;
  let idleWaiters: (() => void)[] = [];

  const waitingOpens = (): number => queue.filter((request) => request.kind === 'open').length;

  const settleIdle = (): void => {
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiters) resolve();
  };

  async function drain(): Promise<void> {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      try {
        await ports.deliver(next);
      } catch (error) {
        ports.log(`Open request failed: ${String(error)}`);
      }
    }
    delivering = false;
    settleIdle();
  }

  /** Delivers the waiting requests in order once the renderer listens; the first one at once. */
  const pump = (): void => {
    if (!started || !listening || delivering || queue.length === 0) return;
    delivering = true;
    void drain();
  };

  return {
    /** An open (`second-instance`, Open recent); dropped and logged when 20 already wait. */
    request(path: string): void {
      if (waitingOpens() >= MAX_WAITING_OPENS) {
        ports.log(`Open request dropped: ${MAX_WAITING_OPENS} already waiting`);
        return;
      }
      queue.push({ kind: 'open', path });
      pump();
    },
    /** F13 `close-requested`, behind every open that came before it; one waits at most. */
    close(): void {
      if (queue.some((request) => request.kind === 'close')) return;
      queue.push({ kind: 'close' });
      pump();
    },
    /** I7: the first waiting path for `open`, once; later requests go by `main:event`. */
    takeStartup(): string | null {
      if (started) return null;
      started = true;
      const at = queue.findIndex((request) => request.kind === 'open');
      const [first] = at < 0 ? [] : queue.splice(at, 1);
      return first?.kind === 'open' ? first.path : null;
    },
    /** The renderer's first N1 (and every later one): it listens now. */
    listening(): void {
      listening = true;
      pump();
    },
    /** Settles when nothing waits or is being delivered. */
    idle(): Promise<void> {
      if (!delivering && (queue.length === 0 || !started || !listening)) {
        return Promise.resolve();
      }
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
  };
}

export interface OpenTargetPorts<R> {
  /** `fs.realpath.native` (a missing file keeps its name under its real folder). */
  realPath(path: string): Promise<string>;
  /** The open tab bound to a real path (case-insensitive on Windows; a picture to its picture). */
  tabOf(realPath: string): Promise<string | null>;
  /** The path is not open in a tab: a ref (or I3's checks), as before. */
  open(): R | Promise<R>;
}

/**
 * T17 (R37): the tab a path is open in, else what `open` makes. A name without an Open extension
 * cannot be bound, so it is not looked up.
 */
export async function openTarget<R>(
  path: string,
  ports: OpenTargetPorts<R>,
): Promise<R | FocusTab> {
  if (kindOfPath(path) !== null) {
    const tabId = await ports.tabOf(await ports.realPath(path));
    if (tabId !== null) return { focus: tabId };
  }
  return ports.open();
}
