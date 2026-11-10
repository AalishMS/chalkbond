import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HINTS } from '../state/catalog';
import { TOOL_IDS, type ToolId } from '../state/editor-state';
import { StatusBar } from './StatusBar';

const render = (tool: ToolId, preset: 'slides' | 'journal' = 'slides', formula = ''): string =>
  renderToStaticMarkup(<StatusBar tool={tool} preset={preset} formula={formula} />);

const EXPECTED: Record<ToolId, string> = {
  select: 'Click a molecule to select it. Drag to move. Drag on empty space to select an area.',
  erase: 'Click or drag over anything to erase it.',
  bond: 'Click to add a bond. Drag to aim it. Click a bond to change it.',
  chain: 'Drag to draw a carbon chain.',
  ring: 'Click to place the ring. Click an atom or bond to attach it.',
  atom: 'Click an atom to change it. Click empty space to add an atom.',
  arrow: 'Drag to draw an arrow.',
  plus: 'Click to place a plus sign.',
  curved: 'Drag from an atom or bond to where the electrons go.',
  text: 'Click to type. Click above or below an arrow for conditions.',
};

describe('StatusBar markup', () => {
  it('shows the spec hint for every tool, word for word', () => {
    for (const tool of TOOL_IDS) {
      expect(HINTS[tool]).toBe(EXPECTED[tool]);
      expect(render(tool)).toContain(`>${EXPECTED[tool]}</div>`);
    }
  });

  it('is a polite live status region', () => {
    expect(render('bond')).toContain('role="status" aria-live="polite"');
  });

  it('presses the preset segment of the document', () => {
    const slides = render('bond', 'slides');
    expect(slides).toContain('data-testid="preset-slides" aria-pressed="true"');
    expect(slides).toContain('data-testid="preset-handout" aria-pressed="false"');
    const handout = render('bond', 'journal');
    expect(handout).toContain('data-testid="preset-slides" aria-pressed="false"');
    expect(handout).toContain('data-testid="preset-handout" aria-pressed="true"');
  });

  it('has the zoom cluster with a 150% readout labelled as reset (R12)', () => {
    const html = render('bond');
    expect(html).toContain('aria-label="Reset zoom (Ctrl+1)"');
    expect(html).toContain('>150%</button>');
    for (const label of ['Zoom out (Ctrl+−)', 'Zoom in (Ctrl+=)', 'Zoom to fit (Ctrl+0)']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });

  it('omits the formula slot and the warnings button when empty', () => {
    const html = render('bond');
    expect(html).not.toContain('data-testid="formula"');
    expect(html).not.toContain('warnings');
  });

  it('renders the formula slot when there is a formula', () => {
    expect(render('bond', 'slides', 'C2H6O')).toContain('data-testid="formula">C2H6O<');
  });
});

describe('StatusBar notice', () => {
  const notice = (kind: 'info' | 'error') =>
    renderToStaticMarkup(
      <StatusBar
        tool="bond"
        preset="slides"
        notice={{ id: 1, kind, text: 'That edit is not possible.' }}
      />,
    );

  it('replaces the hint with the warning icon and the text', () => {
    const html = notice('error');
    expect(html).toContain('<use href="#warning"></use>');
    expect(html).toContain('<span class="hint-text">That edit is not possible.</span>');
    expect(html).not.toContain(HINTS.bond);
    expect(html).toContain('class="hint hint-error"');
    expect(html).toContain('role="status" aria-live="polite"');
  });

  it('shows an info notice in the normal text colour', () => {
    expect(notice('info')).toContain('class="hint"');
  });
});
