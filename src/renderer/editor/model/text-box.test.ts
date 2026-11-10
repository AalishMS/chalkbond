import { addAtom, emptyDoc } from '@core/doc-model';
import { render } from '@core/svg-render';
import { describe, expect, it } from 'vitest';
import { labelBox } from './text-box';
import { bluToScreen, initialViewport, PX_PER_PT } from './viewport';

const NOW = '2026-01-01T00:00:00.000Z';

describe('labelBox (L1)', () => {
  const [doc, id] = addAtom(emptyDoc(NOW), { element: 'O', x: 2, y: 1 });
  const scene = render(doc);
  const viewport = initialViewport(null, { w: 1200, h: 700 }, scene.style.bondLength);

  it('is centred on the atom at the rendered font size and zoom', () => {
    const box = labelBox(doc, scene, viewport, id);
    const at = bluToScreen(viewport, { x: 2, y: 1 }, scene.style.bondLength);
    expect(box?.at).toEqual(at);
    expect(box?.fontPx).toBeCloseTo(scene.style.fontSize * viewport.zoom * PX_PER_PT, 9);
  });

  it('follows the zoom', () => {
    const zoomed = { ...viewport, zoom: viewport.zoom * 2 };
    expect(labelBox(doc, scene, zoomed, id)?.fontPx).toBeCloseTo(
      (labelBox(doc, scene, viewport, id)?.fontPx ?? 0) * 2,
      9,
    );
  });

  it('is null for an atom that is gone', () => {
    expect(labelBox(doc, scene, viewport, 'a99' as never)).toBeNull();
  });
});
