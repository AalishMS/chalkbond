import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createEditorController } from '../state/controller';
import { Canvas } from './Canvas';

const controller = () => createEditorController({ clock: () => '2026-01-01T00:00:00.000Z' });

describe('Canvas markup', () => {
  const html = renderToStaticMarkup(<Canvas controller={controller()} />);

  it('is the focusable drawing application described by the hint', () => {
    expect(html).toContain('data-testid="canvas"');
    expect(html).toContain('role="application"');
    expect(html).toContain('aria-label="Drawing canvas"');
    expect(html).toContain('aria-describedby="editor-hint"');
    expect(html).toContain('tabindex="0"');
  });

  it('has the content layer with its transform, then the overlay above it', () => {
    expect(html).toContain('data-layer="content"');
    expect(html).toContain('transform="matrix(2 0 0 2 0 0)"');
    expect(html.indexOf('data-testid="content"')).toBeLessThan(
      html.indexOf('data-testid="overlay"'),
    );
    expect(html).toContain('aria-hidden="true"');
  });

  it('gives the content layer the export wrapper presentation (a circle has no fill of its own)', () => {
    expect(html).toContain('fill="none" stroke-linecap="round" stroke-linejoin="round"');
  });

  it('puts children (the empty state) above the layers', () => {
    const withChild = renderToStaticMarkup(
      <Canvas controller={controller()}>
        <p data-testid="child" />
      </Canvas>,
    );
    expect(withChild.indexOf('data-testid="overlay"')).toBeLessThan(
      withChild.indexOf('data-testid="child"'),
    );
  });

  it('marks the canvas while Space is held', () => {
    const c = controller();
    c.store.dispatch({ type: 'set-space', held: true });
    expect(renderToStaticMarkup(<Canvas controller={c} />)).toContain('data-space=""');
    expect(html).not.toContain('data-space');
  });
});
