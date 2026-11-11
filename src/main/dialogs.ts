// Native dialogs (SPEC-app-shell.md I1 Open, F8 Save with the R6 extension rule and replace box,
// I4 questions, I5 file errors). The texts come from model/messages.ts (SEC15); the folders come
// from injected ports until settings (A10) remembers them.
import { join } from 'node:path';
import type {
  AskAnswer,
  AskRequest,
  ChooseSaveRequest,
  FileProblem,
  FileRef,
} from '../shared/ipc-types';
import { baseName, kindOfPath, OPEN_KINDS, withExtension, type FileRefs } from './model/file-refs';
import {
  fileErrorBox,
  recoverBox,
  replaceBox,
  saveChangesBox,
  type BoxOptions,
} from './model/messages';

interface Filter {
  name: string;
  extensions: string[];
}

/** `dialog.showOpenDialog` / `showSaveDialog` / `showMessageBox`, parented by main's window. */
export interface DialogPort {
  open(options: {
    defaultPath: string;
    properties: ['openFile'];
    filters: Filter[];
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
  save(options: {
    defaultPath: string;
    filters: Filter[];
  }): Promise<{ canceled: boolean; filePath?: string | undefined }>;
  box(options: BoxOptions): Promise<{ response: number }>;
}

export interface DialogOptions {
  port: DialogPort;
  refs: FileRefs;
  /** Whether a file exists at `path` (R6 replace box). */
  exists(path: string): Promise<boolean>;
  /** F2: the last open folder, else Documents; F6: the save folder (A8–A10 provide them). */
  folders: { open(): string; save(): string };
}

/** F8: one filter per format. */
const SAVE_FILTERS: Record<FileRef['kind'], Filter> = {
  chalk: { name: 'Chalkbond drawing', extensions: ['chalk'] },
  png: { name: 'PNG picture', extensions: ['png'] },
  svg: { name: 'SVG drawing', extensions: ['svg'] },
  pdf: { name: 'PDF document', extensions: ['pdf'] },
};

export function createDialogs({ port, refs, exists, folders }: DialogOptions) {
  return {
    /**
     * I1: a ref for the chosen file, or null when cancelled. A name without an Open extension
     * (typed `notes.docx`) gets the F14 `unsupported` box, built here from the base name, and null.
     */
    async chooseOpen(): Promise<FileRef | null> {
      const result = await port.open({
        defaultPath: folders.open(),
        properties: ['openFile'],
        filters: [{ name: 'Chalkbond drawings', extensions: [...OPEN_KINDS] }],
      });
      const path = result.canceled ? undefined : result.filePaths[0];
      if (path === undefined) return null;
      const kind = kindOfPath(path);
      if (kind === null) {
        await port.box(fileErrorBox('unsupported', baseName(path)));
        return null;
      }
      return refs.add(path, kind, 'opened');
    },

    /** C3 (F8): a writable ref of `format`, or null when cancelled. */
    async chooseSave(
      format: ChooseSaveRequest['format'],
      suggestedName: string,
    ): Promise<FileRef | null> {
      const result = await port.save({
        defaultPath: join(folders.save(), suggestedName),
        filters: [SAVE_FILTERS[format]],
      });
      if (result.canceled || !result.filePath) return null;
      // R6: Windows asked about the name the teacher typed; an appended name is asked here.
      const path = withExtension(result.filePath, format);
      if (path !== result.filePath && (await exists(path))) {
        const { response } = await port.box(replaceBox(baseName(path)));
        if (response !== 0) return null;
      }
      return refs.add(path, format, 'saved');
    },

    /** I4. */
    async ask<R extends AskRequest>(request: R): Promise<AskAnswer<R>> {
      if (request.kind === 'recover') {
        const { response } = await port.box(recoverBox());
        return (response === 1 ? 'delete' : 'recover') as AskAnswer<R>;
      }
      const { response } = await port.box(saveChangesBox(request.name));
      const answers = ['save', 'discard', 'cancel'] as const;
      return (answers[response] ?? 'cancel') as AskAnswer<R>;
    },

    /** I5: the F14 box. */
    async showFileError(problem: FileProblem, name: string): Promise<void> {
      await port.box(fileErrorBox(problem, name));
    },
  };
}
export type Dialogs = ReturnType<typeof createDialogs>;
