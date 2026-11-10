import { expect, it } from 'vitest';
import { createSession, sessionUpdate } from './session';
it('starts Untitled and derives dirty from the controller or forced recovery flag', () => {
  const session = createSession();
  expect(session).toEqual({ name: 'Untitled', kind: 'untitled', ref: null, forcedDirty: false });
  expect(sessionUpdate(session, false)).toEqual({ title: 'Untitled - Chalkbond', dirty: false });
  expect(sessionUpdate(session, true)).toEqual({ title: '*Untitled - Chalkbond', dirty: true });
  expect(sessionUpdate({ ...session, forcedDirty: true }, false).dirty).toBe(true);
});
