import type { Formula } from '@core/chem-core';
import type { AtomId, BondId, ObjectId } from '@core/doc-model';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HINTS } from '../state/catalog';
import { TOOL_IDS, type Hit, type ToolId } from '../state/editor-state';
import { StatusBar } from './StatusBar';

const noop = (): undefined => undefined;

const render = (
  tool: ToolId,
  preset: 'slides' | 'journal' = 'slides',
  formula: Formula | null = null,
): string =>
  renderToStaticMarkup(
    <StatusBar tool={tool} preset={preset} formula={formula} zoom={1.5} dispatch={noop} />,
  );

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
    const ethanol: Formula = {
      counts: { C: 2, H: 6, O: 1 },
      charge: 0,
      hill: 'C2H6O',
      text: 'C2H6O',
      mw: 46.069,
      exactMass: 46.04,
    };
    expect(render('bond', 'slides', ethanol)).toContain(
      'data-testid="formula">C<sub>2</sub>H<sub>6</sub>O · 46.07 g/mol<',
    );
  });
});

describe('StatusBar hover hints (K2 hover keys)', () => {
  const atom: Hit = { kind: 'atom', id: 'a1' as AtomId };
  const bond: Hit = { kind: 'bond', id: 'b1' as BondId };
  const arrow: Hit = { kind: 'object', id: 'o1' as ObjectId, type: 'arrow' };
  const withHover = (tool: ToolId, hover: Hit | null, extra = {}): string =>
    renderToStaticMarkup(
      <StatusBar tool={tool} preset="slides" zoom={1.5} dispatch={noop} hover={hover} {...extra} />,
    );

  it('an atom shows the element-key hint, a bond the order-key hint', () => {
    expect(withHover('bond', atom)).toContain(
      'Type O, N, Cl… to change this atom. Enter for any label.',
    );
    expect(withHover('select', bond)).toContain('Press 1, 2 or 3 for single, double, triple.');
  });

  it('keeps the tool hint over an object, with no hover, and with Erase or Text', () => {
    expect(withHover('select', arrow)).toContain(HINTS.select);
    expect(withHover('bond', null)).toContain(HINTS.bond);
    expect(withHover('erase', atom)).toContain(HINTS.erase);
    expect(withHover('text', atom)).toContain(HINTS.text);
  });

  it('a notice or the name field hint wins over the hover hint', () => {
    expect(withHover('bond', atom, { nameFieldFocused: true })).toContain('Enter inserts.');
    expect(
      withHover('bond', atom, { notice: { id: 1, kind: 'info', text: 'Inserted ethanol' } }),
    ).toContain('Inserted ethanol');
  });
});

describe('StatusBar name-field hint', () => {
  it('replaces the tool hint while the name field has focus, but not a notice', () => {
    const html = renderToStaticMarkup(
      <StatusBar tool="bond" preset="slides" zoom={1.5} dispatch={noop} nameFieldFocused />,
    );
    expect(html).toContain(
      'Enter inserts. Write a reaction like: ethanol + acetic acid -&gt; ethyl acetate',
    );
    expect(html).not.toContain(HINTS.bond);
  });
});

describe('StatusBar notice', () => {
  const notice = (kind: 'info' | 'error') =>
    renderToStaticMarkup(
      <StatusBar
        tool="bond"
        preset="slides"
        zoom={1.5}
        dispatch={noop}
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

describe('StatusBar zoom cluster', () => {
  const zoomed = (zoom: number, dispatch = noop): string =>
    renderToStaticMarkup(<StatusBar tool="bond" preset="slides" zoom={zoom} dispatch={dispatch} />);

  it('reads the zoom as a whole percent', () => {
    expect(zoomed(1.5)).toContain('>150%</button>');
    expect(zoomed(1.25)).toContain('>125%</button>');
    expect(zoomed(4.166666)).toContain('>417%</button>');
  });

  it('greys zoom out at 25 % and zoom in at 800 %, nothing else', () => {
    expect(zoomed(0.25)).toContain('aria-label="Zoom out (Ctrl+−)" aria-disabled="true"');
    expect(zoomed(0.25)).not.toContain('aria-label="Zoom in (Ctrl+=)" aria-disabled');
    expect(zoomed(8)).toContain('aria-label="Zoom in (Ctrl+=)" aria-disabled="true"');
    expect(zoomed(8)).not.toContain('aria-label="Zoom out (Ctrl+−)" aria-disabled');
    expect(zoomed(1.5)).not.toContain('aria-disabled');
  });
});
