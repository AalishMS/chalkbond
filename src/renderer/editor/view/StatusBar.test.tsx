import type { Formula } from '@core/chem-core';
import type { AtomId, BondId, ObjectId } from '@core/doc-model';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HINTS } from '../state/catalog';
import { TOOL_IDS, type Hit, type ToolId } from '../state/editor-state';
import { presetForKey, StatusBar } from './StatusBar';

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

  it('is a two-option radio group that shows the document preset', () => {
    const slides = render('bond', 'slides');
    expect(slides).toContain('role="radiogroup" aria-label="Style"');
    expect(slides).toMatch(
      /role="radio" aria-checked="true" tabindex="0"[^>]*data-testid="preset-slides"/,
    );
    expect(slides).toMatch(
      /role="radio" aria-checked="false" tabindex="-1"[^>]*data-testid="preset-handout"/,
    );
    const handout = render('bond', 'journal');
    expect(handout).toMatch(/aria-checked="false" tabindex="-1"[^>]*data-testid="preset-slides"/);
    expect(handout).toMatch(/aria-checked="true" tabindex="0"[^>]*data-testid="preset-handout"/);
  });

  it('arrow keys move to the other option, Home and End to the ends, other keys nothing', () => {
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      expect(presetForKey(key, 'slides')).toBe('journal');
      expect(presetForKey(key, 'journal')).toBe('slides');
    }
    expect(presetForKey('Home', 'journal')).toBe('slides');
    expect(presetForKey('Home', 'slides')).toBe('slides');
    expect(presetForKey('End', 'slides')).toBe('journal');
    expect(presetForKey('End', 'journal')).toBe('journal');
    expect(presetForKey('a', 'slides')).toBeNull();
    expect(presetForKey('Enter', 'slides')).toBeNull();
  });

  it('has the zoom cluster: the 150% default readout labelled "Zoom to 100%" (R49)', () => {
    const html = render('bond');
    expect(html).toContain('aria-label="Zoom to 100% (Ctrl+1)"');
    expect(html).not.toContain('Reset zoom');
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

describe('StatusBar angle hint while a bond is dragged', () => {
  const dragging = (gesture: string | null, extra = {}): string =>
    renderToStaticMarkup(
      <StatusBar
        tool="bond"
        preset="slides"
        zoom={1.5}
        dispatch={noop}
        gesture={gesture}
        {...extra}
      />,
    );

  it('a bond drag says how to leave the 30 degree steps', () => {
    expect(dragging('bond-drag')).toContain('>Hold Shift for any angle.</div>');
    expect(dragging('bond-press')).toContain(HINTS.bond);
    expect(dragging(null)).toContain(HINTS.bond);
  });

  it('a notice still wins', () => {
    expect(
      dragging('bond-drag', { notice: { id: 1, kind: 'info', text: 'Inserted ethanol' } }),
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

  it('shows an info notice in the normal text colour, with no icon', () => {
    const html = notice('info');
    expect(html).toContain('class="hint hint-info"');
    expect(html).toContain('<span class="hint-text">That edit is not possible.</span>');
    expect(html).not.toContain('<use href="#warning"></use>');
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

describe('StatusBar warnings button (C6)', () => {
  const withWarnings = (n: number | undefined): string =>
    renderToStaticMarkup(
      <StatusBar
        tool="select"
        preset="slides"
        zoom={1.5}
        dispatch={noop}
        {...(n === undefined ? {} : { warnings: n })}
      />,
    );

  it('is hidden without warnings', () => {
    expect(withWarnings(undefined)).not.toContain('data-testid="warnings"');
    expect(withWarnings(0)).not.toContain('data-testid="warnings"');
  });

  it('shows the icon and the count, named for a screen reader', () => {
    const one = withWarnings(1);
    expect(one).toContain('data-testid="warnings"');
    expect(one).toContain('aria-label="1 warning"');
    expect(one).toContain('<span>1</span>');
    expect(one).toContain('href="#warning"');
    const two = withWarnings(2);
    expect(two).toContain('aria-label="2 warnings"');
    expect(two).toContain('<span>2</span>');
  });

  it('sits between the formula and the preset switch', () => {
    const html = withWarnings(1);
    expect(html.indexOf('data-testid="warnings"')).toBeLessThan(html.indexOf('preset-slides'));
  });
});
