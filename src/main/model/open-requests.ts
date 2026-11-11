// F11 second instance (SPEC-app-shell.md F11): the path a launch asks to open waits until the
// renderer can take it. Before I7 has answered, the latest request is I7's `open`; between I7 and
// the renderer's first N1 (it listens for `main:event` from then on) the latest waits and is
// delivered at that N1; afterwards each request is delivered at once. Pure: delivery is injected.
export function createOpenRequests(initial: string | null, deliver: (path: string) => void) {
  let pending = initial;
  let started = false;
  let listening = false;
  const flush = (): void => {
    if (!started || !listening || pending === null) return;
    const path = pending;
    pending = null;
    deliver(path);
  };
  return {
    /** A launch's file (`second-instance`); latest wins. */
    request(path: string): void {
      pending = path;
      flush();
    },
    /** I7: the path for `open`, once; later requests go by `main:event`. */
    takeStartup(): string | null {
      const path = started ? null : pending;
      if (!started) pending = null;
      started = true;
      return path;
    },
    /** The renderer's first N1 (and every later one): it listens now. */
    listening(): void {
      listening = true;
      flush();
    },
  };
}
