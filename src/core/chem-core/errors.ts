export type ChemErrorCode =
  | 'invalid-smiles'
  | 'invalid-molfile'
  | 'not-found'
  | 'empty'
  | 'too-large'
  | 'cannot-kekulize'
  | 'unknown-label';

/** Bad user input or impossible chemistry. Returned in a `Result` or thrown by Doc → Doc ops. */
export class ChemError extends Error {
  override readonly name = 'ChemError';

  constructor(
    readonly code: ChemErrorCode,
    message: string = code,
    /** Close dictionary names, for 'not-found'. */
    readonly suggestions?: readonly string[],
  ) {
    super(message);
  }
}
