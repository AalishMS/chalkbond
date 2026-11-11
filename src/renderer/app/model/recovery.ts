// The renderer side of recovery (SPEC-app-shell.md RC1, RC2, RC5). Pure over ports: while the
// drawing is dirty (F7: the editor's dirty or a recovered drawing's forcedDirty), N3 carries the
// committed document (never a preview: `doc()` / `text()` read the controller's committed drawing)
// on the RC1 timer; when it becomes clean (Save, undo back to the saved state) N4 clears the file.
// Explicit clears come from the file flows (New / Open after F4, Delete, a normal close).
import { createRecoveryTimer } from './recovery-timer';

export interface RecoveryMain {
  writeRecovery(value: { text: string; name: string }): void;
  clearRecovery(): void;
}

export interface RecoveryOptions {
  now(): number;
  schedule(fn: () => void, ms: number): () => void;
  main: RecoveryMain;
  /** F7. */
  dirty(): boolean;
  /** The committed document's identity: a change restarts the timer. */
  doc(): unknown;
  /** `serialize(committed document)`. */
  text(): string;
  /** The name for `recovery.json` (`recoveryName(session)`). */
  name(): string;
}

export interface Recovery {
  /** After a controller `doc` or `dirty` event (and a session change). */
  update(): void;
  /** N4 now (pending write dropped); sent once until something is written again. */
  clear(): void;
  /** After a successful save: clean → clear; still dirty (a newer edit) → the file is kept. */
  settle(): void;
  /** A recovered drawing was loaded: its file is the recovery file; nothing to write yet. */
  adopt(): void;
  /** RC5: N3 at once when dirty. */
  flush(): void;
}

export function createRecovery(o: RecoveryOptions): Recovery {
  let wasDirty = false;
  let lastDoc: unknown = o.doc();
  /** N4 was sent and nothing has been written since. False at start: last run's file may exist. */
  let cleared = false;

  const write = (): void => {
    if (!o.dirty()) return;
    o.main.writeRecovery({ text: o.text(), name: o.name() });
    cleared = false;
  };
  const timer = createRecoveryTimer({ now: o.now, schedule: o.schedule, fire: write });

  const clear = (): void => {
    timer.cancel();
    wasDirty = o.dirty();
    lastDoc = o.doc();
    if (cleared) return;
    cleared = true;
    o.main.clearRecovery();
  };

  return {
    update() {
      const dirty = o.dirty();
      const doc = o.doc();
      const changed = doc !== lastDoc;
      lastDoc = doc;
      if (dirty) {
        wasDirty = true;
        if (changed) timer.change();
      } else if (wasDirty) {
        clear();
      } else {
        timer.cancel();
      }
    },
    clear,
    settle() {
      if (!o.dirty()) clear();
    },
    adopt() {
      timer.cancel();
      wasDirty = o.dirty();
      lastDoc = o.doc();
      cleared = false;
    },
    flush() {
      timer.cancel();
      write();
    },
  };
}
