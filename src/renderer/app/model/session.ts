import type { FileRef, SessionUpdate } from '../../../shared/ipc-types';
import { windowTitle } from '../../../main/model/titles';
export interface Session {
  name: string;
  kind: 'untitled' | 'chalk' | 'picture' | 'recovered';
  ref: FileRef | null;
  forcedDirty: boolean;
}
export function createSession(): Session {
  return { name: 'Untitled', kind: 'untitled', ref: null, forcedDirty: false };
}
export function sessionUpdate(session: Session, controllerDirty: boolean): SessionUpdate {
  const dirty = session.forcedDirty || controllerDirty;
  return { title: windowTitle(session.name, dirty), dirty };
}
