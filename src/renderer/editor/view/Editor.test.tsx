import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createEditorController } from '../state/controller';
import { insertText } from '../model/text-edit';
import { addEthane, atomId, labelEditing } from '../state/testing';
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

describe('Editor name field and status formula', () => {
  const make = () => createEditorController({ clock: () => '2026-01-01T00:00:00.000Z' });
  const render = (c: ReturnType<typeof make>): string =>
    renderToStaticMarkup(<Editor controller={c} />);

  it('shows no formula and the empty state while the document is empty', () => {
    const html = render(make());
    expect(html).not.toContain('data-testid="formula"');
    expect(html).toContain('data-testid="empty-state"');
  });

  it('after inserting ethanol: formula and mass, no empty state, "Inserted ethanol" announced', () => {
    const c = make();
    c.run({ type: 'insert-text', text: 'ethanol' });
    const html = render(c);
    expect(html).toContain('data-testid="formula">C<sub>2</sub>H<sub>6</sub>O · 46.07 g/mol<');
    expect(html).not.toContain('data-testid="empty-state"');
    expect(html).toContain('Inserted ethanol');
  });

  it('shows the dropdown while typing a name', () => {
    const c = make();
    c.store.dispatch({ type: 'name-text', text: 'eth' });
    expect(render(c)).toContain('role="listbox"');
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
    c.store.dispatch({ type: 'set-editing', editing: labelEditing(atomId(1)) });
    const html = render(c);
    expect(html).toContain('data-testid="undo" aria-label="Undo (Ctrl+Z)" aria-disabled="true"');
    expect(c.canRun('undo')).toBe(false);
  });
});

describe('the label editor in the window (L1, L2)', () => {
  const make = () => {
    const c = createEditorController({ clock: () => '2026-01-01T00:00:00.000Z' });
    c.store.dispatch({ type: 'commit', label: 'Add bond', recipe: addEthane });
    c.store.dispatch({ type: 'canvas-resized', size: { w: 1200, h: 700 } });
    return c;
  };
  const html = (c: ReturnType<typeof createEditorController>): string =>
    renderToStaticMarkup(<Editor controller={c} />);

  it('is not drawn until it is opened', () => {
    expect(html(make())).not.toContain('data-testid="textbox"');
  });

  it('shows the box with the caption and the editing hint', () => {
    const c = make();
    c.store.dispatch({ type: 'open-label', atom: atomId(1) });
    const out = html(c);
    expect(out).toContain('data-testid="textbox"');
    expect(out).toContain('="plaintext-only"');
    expect(out).toContain('e.g. OH, NH2, Cl, Ph, CO2H');
    expect(out).toContain('Enter finishes. Esc cancels.');
  });

  it('turns the caption into the warning for text that is not known', () => {
    const c = make();
    c.store.dispatch({ type: 'open-label', atom: atomId(1) });
    const editing = c.store.getState().editing;
    if (editing === null) throw new Error('not open');
    c.store.dispatch({ type: 'edit-set', edit: insertText(editing.edit, 'H20') });
    const out = html(c);
    expect(out).toContain('Not a known group; it will be drawn as typed.');
    expect(out).toContain('data-tone="warning"');
  });

  it('shows no markup syntax', () => {
    const c = make();
    c.store.dispatch({ type: 'open-label', atom: atomId(1) });
    expect(html(c)).not.toMatch(/_\{|\^\{/);
  });
});

describe('the text editor in the window (T1, T2, T5)', () => {
  const make = () => {
    const c = createEditorController({ clock: () => '2026-01-01T00:00:00.000Z' });
    c.store.dispatch({ type: 'canvas-resized', size: { w: 1200, h: 700 } });
    c.store.dispatch({
      type: 'open-text',
      target: { kind: 'new', fresh: { at: { x: 1, y: 1 }, align: 'left' } },
    });
    return c;
  };
  const html = (c: ReturnType<typeof createEditorController>): string =>
    renderToStaticMarkup(<Editor controller={c} />);

  it('hides the empty state while the box is open on an empty document', () => {
    expect(html(make())).not.toContain('Type a compound name above');
  });

  it('shows a multi-line box anchored at its left edge, with the text hint', () => {
    const out = html(make());
    expect(out).toContain('data-mode="text"');
    expect(out).toContain('data-anchor="left"');
    expect(out).toContain('aria-multiline="true"');
    expect(out).toContain('Enter finishes. Shift+Enter starts a new line.');
    expect(out).not.toContain('e.g. OH, NH2');
  });

  it('replaces the options with the text options and disables Undo and Redo', () => {
    const out = html(make());
    for (const id of [
      'txt-sub',
      'txt-sup',
      'txt-bold',
      'txt-italic',
      'txt-delta',
      'txt-hv',
      'txt-deg',
      'txt-arrow',
    ]) {
      expect(out).toContain(`data-testid="${id}"`);
    }
    expect(out).toContain('Insert');
    expect(out).not.toContain('data-testid="opt-');
    expect(out).toContain('data-testid="undo" aria-label="Undo (Ctrl+Z)" aria-disabled="true"');
  });

  it('shows the pressed state of B, I and x2 from the model', () => {
    const c = make();
    expect(html(c)).not.toMatch(/data-testid="txt-[a-z]+"[^>]*aria-pressed="true"/);
    c.store.dispatch({ type: 'edit-style', flag: 'bold' });
    c.store.dispatch({ type: 'edit-script', script: 'sub' });
    const out = html(c);
    expect(out).toMatch(/data-testid="txt-bold"[^>]*aria-pressed="true"/);
    expect(out).toMatch(/data-testid="txt-sub"[^>]*aria-pressed="true"/);
    expect(out).toMatch(/data-testid="txt-sup"[^>]*aria-pressed="false"/);
    expect(out).toMatch(/data-testid="txt-italic"[^>]*aria-pressed="false"/);
  });

  it('shows no markup syntax', () => {
    expect(html(make())).not.toMatch(/_\{|\^\{/);
  });
});
