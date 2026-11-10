import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createEditorController } from '../state/controller';
import { addEthane, atomId } from '../state/testing';
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

describe('Canvas cursor and hover overlay', () => {
  const rendered = (c: ReturnType<typeof controller>): string =>
    renderToStaticMarkup(<Canvas controller={c} />);

  it('sets the cursor from the tool: crosshair for Bond, default for Select over nothing', () => {
    const c = controller();
    expect(rendered(c)).toContain('data-cursor="crosshair"');
    c.store.dispatch({ type: 'select-tool', tool: 'select' });
    expect(rendered(c)).toContain('data-cursor="default"');
    c.store.dispatch({ type: 'select-tool', tool: 'text' });
    expect(rendered(c)).toContain('data-cursor="text"');
  });

  it('the Erase tool carries its data: cursor in --cursor-erase', () => {
    const c = controller();
    c.store.dispatch({ type: 'select-tool', tool: 'erase' });
    const html = rendered(c);
    expect(html).toContain('data-cursor="erase"');
    expect(html).toContain('--cursor-erase:url(&quot;data:image/svg+xml,');
  });

  it('Space held shows the grab hand whatever the tool', () => {
    const c = controller();
    c.store.dispatch({ type: 'set-space', held: true });
    expect(rendered(c)).toContain('data-cursor="grab"');
  });

  it('draws the hover circle of a hovered skeleton vertex: r 9, in the hover group', () => {
    const c = controller();
    c.store.dispatch({ type: 'commit', label: 'Add bond', recipe: addEthane });
    c.store.dispatch({ type: 'set-hover', hover: { kind: 'atom', id: atomId(1) } });
    const html = rendered(c);
    expect(html).toContain('<g class="overlay-hover" data-testid="overlay-hover">');
    expect(html).toMatch(/<circle cx="[\d.]+" cy="[\d.]+" r="9"><\/circle>/);
  });

  it('draws nothing in the overlay without a hover', () => {
    expect(rendered(controller())).not.toContain('overlay-hover');
  });
});
