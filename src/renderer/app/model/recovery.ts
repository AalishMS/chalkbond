// The renderer side of recovery (SPEC-app-shell.md RC1, RC2, RC5). Pure over ports: while the
// drawing is dirty (F7: the editor's dirty or a recovered drawing's forcedDirty), N3 carries the
// committed document (never a preview: `doc()` / `text()` read the controller's committed drawing)
// on the RC1 timer; when it becomes clean (Save, undo back to the saved state) N4 clears the file.
// Explicit clears come from the file flows (New / Open after F4, Delete, a normal close). RC7 (R23):
// while the startup offer is unanswered nothing is written or cleared by a change.
import { createAutosaveTimer } from './autosave-timer';

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
  /**
   * R25: runs at the start of `flush` (not while suspended), before the write; the host finishes an
   * open label or text editor here so its text is in the committed drawing. Synchronous.
   */
  beforeFlush?(): void;
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
  /** RC7: the startup offer is open; changes and flushes send nothing (explicit clears still do). */
  suspend(): void;
  /**
   * RC7: the offer is answered. After `adopt` (Recover) nothing is written until a change; otherwise
   * a dirty drawing (edited during the offer) starts the RC1 timer. Nothing when not suspended.
   */
  resume(): void;
}

export function createRecovery(o: RecoveryOptions): Recovery {
  let wasDirty = false;
  let lastDoc: unknown = o.doc();
  /** N4 was sent and nothing has been written since. False at start: last run's file may exist. */
  let cleared = false;
  let suspended = false;
  /** `adopt` ran during the suspension: the recovered drawing is the file already. */
  let adopted = false;

  const write = (): void => {
    if (!o.dirty()) return;
    o.main.writeRecovery({ text: o.text(), name: o.name() });
    cleared = false;
  };
  const timer = createAutosaveTimer({ now: o.now, schedule: o.schedule, fire: write });

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
      if (suspended) return;
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
      adopted = true;
      timer.cancel();
      wasDirty = o.dirty();
      lastDoc = o.doc();
      cleared = false;
    },
    flush() {
      if (suspended) return;
      o.beforeFlush?.();
      timer.cancel();
      write();
    },
    suspend() {
      suspended = true;
      adopted = false;
      timer.cancel();
    },
    resume() {
      if (!suspended) return;
      suspended = false;
      lastDoc = o.doc();
      wasDirty = o.dirty();
      if (wasDirty && !adopted) timer.change();
    },
  };
}
