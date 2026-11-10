import { expect, it } from 'vitest';
import { windowTitle } from './titles';
it.each([
  ['Untitled', false, 'Untitled - Chalkbond'],
  ['esterification.chalk', true, '*esterification - Chalkbond'],
  ['ethanol.png', false, 'ethanol.png - Chalkbond'],
  ['ethanol.svg', true, '*ethanol.svg - Chalkbond'],
  ['ethanol.pdf', false, 'ethanol.pdf - Chalkbond'],
  ['Recovered drawing', true, '*Recovered drawing - Chalkbond'],
])('titles %s', (name, dirty, expected) => expect(windowTitle(name, dirty)).toBe(expected));
