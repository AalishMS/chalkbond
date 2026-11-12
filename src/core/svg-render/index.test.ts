import { describe, expect, it } from 'vitest';
import { benzene } from './__fixtures__/molecules';
import * as api from './index';

describe('public entry', () => {
  it('exports the documented functions and constants', () => {
    for (const name of [
      'render',
      'toSvg',
      'renderSvg',
      'resolveStyle',
      'bluToPt',
      'ptToBlu',
      'isLabelled',
      'ringAtoms',
    ] as const) {
      expect(typeof api[name]).toBe('function');
    }
    expect(Object.keys(api.STYLE_PRESETS).sort()).toEqual(['journal', 'slides']);
  });

  it('renderSvg is usable through the entry alone', () => {
    const out = api.renderSvg(benzene().doc);
    expect(out.svg.startsWith('<svg ')).toBe(true);
    expect(out.width).toBeGreaterThan(0);
  });

  it('bluToPt and ptToBlu are inverses under a resolved style', () => {
    const style = api.resolveStyle({ preset: 'slides', overrides: {} });
    const p = { x: 1.25, y: -0.5 };
    expect(api.bluToPt(p, style)).toEqual({ x: 50, y: -20 });
    expect(api.ptToBlu(api.bluToPt(p, style), style)).toEqual(p);
  });
});
