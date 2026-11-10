import { describe, expect, it } from 'vitest';
import type { Rect } from '../doc-model';
import { checkXml } from './__fixtures__/xml-check';
import { goldenScenes, PRESETS } from './__fixtures__/golden-scenes';
import { inkScan } from './__fixtures__/ink-scan';
import { render } from './render';
import { toSvg } from './to-svg';

// SPEC-svg-render.md "Testing", golden set. Each scene is rendered in both presets and compared
// with `__golden__/<scene>.<preset>.svg`. A byte snapshot cannot tell a wrong picture from a
// right one: goldens are recorded only from output reviewed on the golden sheet
// (`npm run golden:sheet`), never re-recorded to make a failing test pass.
const scenes = goldenScenes();

const cases = scenes.flatMap((s) => PRESETS.map((preset) => ({ ...s, preset })));

function build(c: (typeof cases)[number]) {
  const doc = { ...c.doc, style: { ...c.doc.style, preset: c.preset } };
  const scene = render(doc, c.only ? { only: c.only } : {});
  return { scene, svg: toSvg(scene).svg };
}

describe('golden set', () => {
  it('has at least 30 scenes with unique names', () => {
    expect(scenes.length).toBeGreaterThanOrEqual(30);
    expect(new Set(scenes.map((s) => s.name)).size).toBe(scenes.length);
  });

  it.each(cases)('$name ($preset) matches its golden', async (c) => {
    const { svg } = build(c);
    await expect(svg).toMatchFileSnapshot(`./__golden__/${c.name}.${c.preset}.svg`);
  });

  it.each(cases)('$name ($preset): well-formed, LF, no notices, bounds equal the ink scan', (c) => {
    const { scene, svg } = build(c);
    expect(svg).not.toContain('\r');
    checkXml(svg);
    expect(scene.notices).toEqual([]);
    expect(scene.parts.length).toBeGreaterThan(0);
    const scan = inkScan(scene.parts.map((p) => p.svg).join('\n')) as Rect;
    const b = scene.bounds as Rect;
    expect(Math.abs(b.x - scan.x)).toBeLessThan(0.01);
    expect(Math.abs(b.y - scan.y)).toBeLessThan(0.01);
    expect(Math.abs(b.w - scan.w)).toBeLessThan(0.01);
    expect(Math.abs(b.h - scan.h)).toBeLessThan(0.01);
  });

  it.each(scenes)('$name: slides and journal share structure, differ in scale', (s) => {
    const [slides, journal] = PRESETS.map((preset) => build({ ...s, preset }));
    const names = (svg: string) =>
      checkXml(svg).elements.map((e) => `${e.name}(${e.attrNames.join(',')})`);
    expect(names((slides as { svg: string }).svg)).toEqual(names((journal as { svg: string }).svg));
    const a = (slides as { scene: { bounds: Rect | null } }).scene.bounds as Rect;
    const b = (journal as { scene: { bounds: Rect | null } }).scene.bounds as Rect;
    // A scene that overrides the whole scale looks the same in both presets.
    if (s.doc.style.overrides.bondLength !== undefined) expect(a.w).toBeCloseTo(b.w, 6);
    else expect(a.w).toBeGreaterThan(b.w);
  });
});
