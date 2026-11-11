// F12 wiring (DOM only): window drag events feed the tracker; a Files drop hands the chosen File
// to the host (I3 through the preload, SEC14). While an in-window dialog is open a file drop still
// prevents the page's default (navigating to the file) but opens nothing (R22). Text drags are not
// touched (the editor's).
import { hasFiles, pickDropped, type DropTracker } from './model/drop';

export interface DropHost {
  modal(): boolean;
  openDropped(file: File): Promise<void>;
}

const typesOf = (event: DragEvent): readonly string[] => [...(event.dataTransfer?.types ?? [])];

export function installDropTarget(
  target: Window,
  tracker: DropTracker,
  host: DropHost,
): () => void {
  const enter = (event: DragEvent): void => {
    if (!hasFiles(typesOf(event))) return;
    event.preventDefault();
    tracker.enter(typesOf(event), host.modal());
  };
  const over = (event: DragEvent): void => {
    if (!hasFiles(typesOf(event))) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = host.modal() ? 'none' : 'copy';
  };
  const leave = (event: DragEvent): void => tracker.leave(typesOf(event));
  const drop = (event: DragEvent): void => {
    if (!hasFiles(typesOf(event))) return;
    event.preventDefault();
    tracker.drop();
    if (host.modal()) return;
    const file = pickDropped([...(event.dataTransfer?.files ?? [])]);
    if (file !== null) void host.openDropped(file);
  };
  const key = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && tracker.visible()) tracker.escape();
  };
  target.addEventListener('dragenter', enter);
  target.addEventListener('dragover', over);
  target.addEventListener('dragleave', leave);
  target.addEventListener('drop', drop);
  target.addEventListener('keydown', key);
  return () => {
    target.removeEventListener('dragenter', enter);
    target.removeEventListener('dragover', over);
    target.removeEventListener('dragleave', leave);
    target.removeEventListener('drop', drop);
    target.removeEventListener('keydown', key);
  };
}
