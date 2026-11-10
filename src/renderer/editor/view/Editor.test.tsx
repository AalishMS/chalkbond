import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createEditorController } from '../state/controller';
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
