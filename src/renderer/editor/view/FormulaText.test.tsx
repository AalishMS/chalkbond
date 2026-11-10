import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formulaRuns } from '../model/formula';
import { FormulaText } from './FormulaText';

describe('FormulaText', () => {
  it('renders atom counts as <sub> and the charge as <sup>', () => {
    expect(renderToStaticMarkup(<FormulaText runs={formulaRuns('C2H3O2', -1)} />)).toBe(
      'C<sub>2</sub>H<sub>3</sub>O<sub>2</sub><sup>−</sup>',
    );
  });
});
