// ST1 (SPEC-app-shell.md "Settings"): a document change that switches the preset (status-bar
// switch, View menu, undo or redo of a switch) is remembered for new drawings; a load is not.
// Host loads (the test hook) go through `load`, and a tab switch's `putState` (T11, SS7) through
// `quietly`, which suppress the memory for exactly that call; dirty and busy are not used as
// signals (a real switch may undo back to clean, or happen while a save runs).
import type { StylePreset } from '@core/doc-model';
import type { EditorController } from '../../editor';

export interface PresetMemory {
  /** `controller.load(doc)` without remembering its preset. */
  load(doc: Parameters<EditorController['load']>[0]): void;
  /** Runs `change` (a tab's state put in) without remembering the preset it brings. */
  quietly(change: () => void): void;
  dispose(): void;
}

export function createPresetMemory(o: {
  controller: Pick<EditorController, 'getDoc' | 'load' | 'subscribe'>;
  remember(style: StylePreset): void;
}): PresetMemory {
  const { controller } = o;
  let last = controller.getDoc().style.preset;
  let loading = false;
  const dispose = controller.subscribe((event) => {
    if (event.type !== 'doc') return;
    const preset = controller.getDoc().style.preset;
    if (preset === last) return;
    last = preset;
    if (!loading) o.remember(preset);
  });
  const quietly = (change: () => void): void => {
    loading = true;
    try {
      change();
    } finally {
      loading = false;
      last = controller.getDoc().style.preset;
    }
  };
  return {
    load: (doc) => quietly(() => controller.load(doc)),
    quietly,
    dispose,
  };
}
