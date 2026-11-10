import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createEditorController } from '../state/controller';
import { initialState } from '../state/editor-state';
import { EMPTY_SCOPE } from '../state/selection-actions';
import { Editor } from './Editor';
import { OptionsBar } from './OptionsBar';
import { StatusBar } from './StatusBar';
import { ToolRail } from './ToolRail';
import { TooltipBubble } from './Tooltip';
import { TopBar } from './TopBar';

const noop = (): undefined => undefined;
const controller = (): ReturnType<typeof createEditorController> =>
  createEditorController({ clock: () => '2026-01-01T00:00:00.000Z' });

describe('TooltipBubble markup', () => {
  it('Bond: title, key cap and help line', () => {
    const html = renderToStaticMarkup(
      <TooltipBubble
        id="tip"
        content={{ title: 'Bond', key: 'B', help: 'Click to add a bond. Drag to aim it.' }}
      />,
    );
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('id="tip"');
    expect(html).toContain('<div class="tooltip-title"><span>Bond</span><kbd>B</kbd></div>');
    expect(html).toContain('<div class="tooltip-help">Click to add a bond. Drag to aim it.</div>');
  });

  it('name only: no key cap and no help line', () => {
    const html = renderToStaticMarkup(<TooltipBubble id="t" content={{ title: 'Cyclopentane' }} />);
    expect(html).not.toContain('<kbd');
    expect(html).not.toContain('tooltip-help');
  });
});

describe('controls carry their tooltip content', () => {
  it('rail buttons: name, key, help; tooltip opens to the right', () => {
    const html = renderToStaticMarkup(<ToolRail state={initialState()} dispatch={noop} />);
    expect(html).toContain('data-tip="Bond" data-tip-key="B"');
    expect(html).toContain('data-tip-help="Click to add a bond. Drag to aim it."');
    expect(html.match(/data-tip-side="right"/g)).toHaveLength(10);
  });

  it('options: name only, opens below', () => {
    const html = renderToStaticMarkup(
      <OptionsBar state={initialState()} scope={EMPTY_SCOPE} dispatch={noop} />,
    );
    expect(html).toContain('data-tip="Single"');
    expect(html).toContain('data-tip-side="below"');
    expect(html).not.toContain('data-tip-help');
  });

  it('a disabled action says why', () => {
    const html = renderToStaticMarkup(
      <OptionsBar
        state={{ ...initialState(), tool: 'select' }}
        scope={EMPTY_SCOPE}
        dispatch={noop}
      />,
    );
    expect(html).toContain('data-tip="Flip horizontal"');
    expect(html.match(/data-tip-help="Select a molecule first\."/g)).toHaveLength(2);
    expect(html).toContain('data-tip-help="Draw a molecule first."');
  });

  it('Undo and Redo: name and key, below the top bar', () => {
    const html = renderToStaticMarkup(
      <TopBar state={initialState()} scope={EMPTY_SCOPE} canUndo={false} canRedo dispatch={noop} />,
    );
    expect(html).toContain('data-tip="Undo" data-tip-key="Ctrl+Z"');
    expect(html).toContain('data-tip-help="Nothing to undo."');
    expect(html).toContain('data-tip="Redo" data-tip-key="Ctrl+Y"');
    expect(html).not.toContain('Nothing to redo.');
  });

  it('status zoom controls open above', () => {
    const html = renderToStaticMarkup(<StatusBar tool="bond" preset="slides" />);
    expect(html).toContain('data-tip="Zoom to fit" data-tip-key="Ctrl+0"');
    expect(html.match(/data-tip-side="above"/g)).toHaveLength(4);
  });

  it('the editor mounts no bubble until a tooltip is wanted', () => {
    const html = renderToStaticMarkup(<Editor controller={controller()} />);
    expect(html).not.toContain('role="tooltip"');
  });
});

describe('keyboard focus markup', () => {
  const html = renderToStaticMarkup(<Editor controller={controller()} />);

  it('the canvas is an application with a name, a hint description and a tab stop', () => {
    const main = /<main[^>]*>/.exec(html)?.[0] ?? '';
    expect(main).toContain('role="application"');
    expect(main).toContain('aria-label="Drawing canvas"');
    expect(main).toContain('aria-describedby="editor-hint"');
    expect(main).toContain('tabindex="0"');
    expect(html).toContain('id="editor-hint"');
  });

  it('the rail has one tab stop: the active tool', () => {
    const rail = html.slice(
      html.indexOf('data-testid="rail"'),
      html.indexOf('data-testid="canvas"'),
    );
    expect(rail.match(/tabindex="0"/g)).toHaveLength(1);
    expect(rail.match(/tabindex="-1"/g)).toHaveLength(9);
    expect(rail).toMatch(/data-testid="tool-bond"[^>]*tabindex="0"/);
  });

  it('the options bar has one tab stop: the selected option', () => {
    const bar = html.slice(html.indexOf('data-testid="options"'), html.indexOf('class="history"'));
    expect(bar.match(/tabindex="0"/g)).toHaveLength(1);
    expect(bar).toMatch(/data-testid="opt-single"[^>]*tabindex="0"/);
  });
});
