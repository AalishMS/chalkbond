import { statusFormula } from './formula';

/** Pointer frames keep these inputs: do not repeat chemistry until one changes. */
export function createStatusFormula(compute = statusFormula): typeof statusFormula {
  let last: Parameters<typeof statusFormula> | undefined;
  let value: ReturnType<typeof statusFormula> = null;
  return (doc, perception, selection) => {
    if (last === undefined || last[0] !== doc || last[1] !== perception || last[2] !== selection) {
      value = compute(doc, perception, selection);
      last = [doc, perception, selection];
    }
    return value;
  };
}
