export type DocErrorCode =
  | 'unknown-atom'
  | 'unknown-bond'
  | 'unknown-object'
  | 'unknown-group'
  | 'self-bond'
  | 'duplicate-bond'
  | 'invalid-attachment'
  | 'invalid-value';

/** Thrown by doc-model operations for references to unknown ids or invalid edits. */
export class DocError extends Error {
  override readonly name = 'DocError';

  constructor(
    readonly code: DocErrorCode,
    readonly detail?: string,
  ) {
    super(detail === undefined ? code : `${code}: ${detail}`);
  }
}
