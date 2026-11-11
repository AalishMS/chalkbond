import { expect, it } from 'vitest';
import { createSession, displayName, fileSession, saveAsName, sessionUpdate } from './session';
it('starts Untitled and derives dirty from the controller or forced recovery flag', () => {
  const session = createSession();
  expect(session).toEqual({ name: 'Untitled', kind: 'untitled', ref: null, forcedDirty: false });
  expect(sessionUpdate(session, false)).toEqual({ title: 'Untitled - Chalkbond', dirty: false });
  expect(sessionUpdate(session, true)).toEqual({ title: '*Untitled - Chalkbond', dirty: true });
  expect(sessionUpdate({ ...session, forcedDirty: true }, false).dirty).toBe(true);
});

it('CO2 / W3: an opened file becomes a chalk or picture session; the prompt name hides .chalk', () => {
  const chalk = { id: '1', name: 'esterification.chalk', kind: 'chalk' } as const;
  const png = { id: '2', name: 'toluene.png', kind: 'png' } as const;
  expect(fileSession(chalk)).toEqual({
    name: 'esterification.chalk',
    kind: 'chalk',
    ref: chalk,
    forcedDirty: false,
  });
  expect(fileSession(png).kind).toBe('picture');
  expect(fileSession({ ...png, kind: 'svg', name: 'a.svg' }).kind).toBe('picture');
  expect(fileSession({ ...png, kind: 'pdf', name: 'a.pdf' }).kind).toBe('picture');
  expect(displayName(fileSession(chalk))).toBe('esterification');
  expect(displayName(fileSession(png))).toBe('toluene.png');
  expect(sessionUpdate(fileSession(png), false).title).toBe('toluene.png - Chalkbond');
  expect(displayName(createSession())).toBe('Untitled');
});

it('F6: the Save as name is the session name without its extension, plus .chalk', () => {
  expect(saveAsName(createSession())).toBe('Untitled.chalk');
  expect(saveAsName(fileSession({ id: '1', name: 'a.b.chalk', kind: 'chalk' }))).toBe('a.b.chalk');
  expect(saveAsName(fileSession({ id: '2', name: 'toluene.PNG', kind: 'png' }))).toBe(
    'toluene.chalk',
  );
  expect(saveAsName({ ...createSession(), name: 'Recovered drawing', kind: 'recovered' })).toBe(
    'Recovered drawing.chalk',
  );
});
