// ST1 (SPEC-app-shell.md "Settings"): a document change that switches the preset (status-bar
// switch, View menu, undo or redo of a switch) is remembered for new drawings; a load is not.
// Host loads (New, Open, recover, test hook) go through `load`, which suppresses the memory for
// exactly the duration of `controller.load`; dirty and busy are not used as signals (a real switch
// may undo back to clean, or happen while a save runs).
import type { StylePreset } from '@core/doc-model';
import type { EditorController } from '../../editor';

export interface PresetMemory {
  /** `controller.load(doc)` without remembering its preset. */
  load(doc: Parameters<EditorController['load']>[0]): void;
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
  return {
    load(doc) {
      loading = true;
      try {
        controller.load(doc);
      } finally {
        loading = false;
        last = controller.getDoc().style.preset;
      }
    },
    dispose,
  };
}
