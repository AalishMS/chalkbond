import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createEditorController } from '../state/controller';
import { addEthane, atomId } from '../state/testing';
import { Editor } from './Editor';
import { Icon } from './Icon';

describe('Editor shell markup', () => {
  const html = renderToStaticMarkup(
    <Editor controller={createEditorController({ clock: () => '2026-01-01T00:00:00.000Z' })} />,
  );

  it('has the four regions with test ids', () => {
    for (const id of ['topbar', 'rail', 'canvas', 'statusbar']) {
      expect(html).toContain(`data-testid="${id}"`);
    }
  });

  it('injects the icon sprite once, hidden from assistive tech', () => {
    expect(html.match(/<symbol id="select"/g)).toHaveLength(1);
    expect(html).toContain('class="sprite" aria-hidden="true"');
  });
});

describe('Icon', () => {
  it('references a sprite symbol at the requested size', () => {
    expect(renderToStaticMarkup(<Icon name="undo" size={20} />)).toBe(
      '<svg class="icon icon-20" aria-hidden="true"><use href="#undo"></use></svg>',
    );
  });
});

describe('Editor history buttons', () => {
  const render = (c: ReturnType<typeof createEditorController>): string =>
    renderToStaticMarkup(<Editor controller={c} />);
  const make = () => createEditorController({ clock: () => '2026-01-01T00:00:00.000Z' });

  it('are disabled on a new document and Undo enables after a commit', () => {
    const c = make();
    expect(render(c)).toContain(
      'data-testid="undo" aria-label="Undo (Ctrl+Z)" aria-disabled="true"',
    );
    c.store.dispatch({ type: 'commit', label: 'Add bond', recipe: addEthane });
    const html = render(c);
    expect(html).not.toContain('data-testid="undo" aria-label="Undo (Ctrl+Z)" aria-disabled');
    expect(html).toContain('data-testid="redo" aria-label="Redo (Ctrl+Y)" aria-disabled="true"');
    c.run('undo');
    expect(render(c)).not.toContain('data-testid="redo" aria-label="Redo (Ctrl+Y)" aria-disabled');
  });

  it('are disabled while an editor is open (R7)', () => {
    const c = make();
    c.store.dispatch({ type: 'commit', label: 'Add bond', recipe: addEthane });
    c.store.dispatch({ type: 'set-editing', editing: { kind: 'label', atom: atomId(1) } });
    const html = render(c);
    expect(html).toContain('data-testid="undo" aria-label="Undo (Ctrl+Z)" aria-disabled="true"');
    expect(c.canRun('undo')).toBe(false);
  });
});
