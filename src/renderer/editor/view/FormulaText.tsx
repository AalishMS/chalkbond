import { Fragment } from 'react';
import type { FormulaRun } from '../model/formula';

/** A formula with real subscripts for atom counts and a superscript charge (Decision 14). */
export function FormulaText({ runs }: { runs: readonly FormulaRun[] }): React.JSX.Element {
  return (
    <>
      {runs.map((run, i) => (
        <Fragment key={i}>
          {run.kind === 'sub' ? (
            <sub>{run.text}</sub>
          ) : run.kind === 'sup' ? (
            <sup>{run.text}</sup>
          ) : (
            run.text
          )}
        </Fragment>
      ))}
    </>
  );
}
