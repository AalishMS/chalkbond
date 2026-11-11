// CO2 (SPEC-app-shell.md "Controller ownership and the session"): the window's session, F7 dirty
// and the W3 title. The host mutates one Session in place; `file-flows.ts` decides the changes.
import type { FileRef, SessionUpdate } from '../../../shared/ipc-types';
import { displayName as shownName, windowTitle } from '../../../main/model/titles';

export interface Session {
  /** The file's base name (`esterification.chalk`, `toluene.png`), `Untitled` or `Recovered drawing`. */
  name: string;
  kind: 'untitled' | 'chalk' | 'picture' | 'recovered';
  ref: FileRef | null;
  /** F7: true only for a recovered drawing until it is saved. */
  forcedDirty: boolean;
}

export function createSession(): Session {
  return { name: 'Untitled', kind: 'untitled', ref: null, forcedDirty: false };
}

/** The session of a file opened or saved through `ref` (a picture is read-only, A6). */
export function fileSession(ref: FileRef): Session {
  return {
    name: ref.name,
    kind: ref.kind === 'chalk' ? 'chalk' : 'picture',
    ref,
    forcedDirty: false,
  };
}

/** The name in the title and in the save prompt: `.chalk` hidden, a picture's extension kept. */
export function displayName(session: Session): string {
  return shownName(session.name);
}

/** F6: the suggested Save as name: the file's name without its extension, plus `.chalk`. */
export function saveAsName(session: Session): string {
  const stem =
    session.kind === 'chalk' || session.kind === 'picture'
      ? session.name.slice(0, Math.max(session.name.lastIndexOf('.'), 0)) || session.name
      : session.name;
  return `${stem}.chalk`;
}

export function sessionUpdate(session: Session, controllerDirty: boolean): SessionUpdate {
  const dirty = session.forcedDirty || controllerDirty;
  return { title: windowTitle(session.name, dirty), dirty };
}
