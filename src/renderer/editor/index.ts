export { Editor } from './view/Editor';
export { createEditorController } from './state/controller';
export type {
  EditorCommand,
  EditorController,
  EditorEvent,
  EditorOptions,
  HostHit,
} from './state/controller';
export {
  tabStateCanRedo,
  tabStateCanUndo,
  tabStateDirty,
  tabStateDoc,
  tabStateMarkSaved,
  tabStateView,
} from './state/tab-state';
export type { EditorTabState } from './state/tab-state';
export { tabStateFromRecord, tabStateToRecord } from './state/tab-state-record';
export type { EditorTabRecord } from './state/tab-state-record';
