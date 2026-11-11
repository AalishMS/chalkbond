import { z } from 'zod';

export const logErrorSchema = z.object({ message: z.string().max(4000) }).strict();

export const startupSchema = z.object({}).strict();
export const sessionUpdateSchema = z
  .object({ title: z.string().max(300), dirty: z.boolean() })
  .strict();

const maxDrawingBytes = 20 * 1024 * 1024;
export const clipboardWriteSchema = z
  .object({
    png: z
      .instanceof(Uint8Array)
      .refine(
        (bytes) =>
          bytes.length <= 64 * 1024 * 1024 &&
          [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte),
      ),
    svg: z
      .string()
      .startsWith('<svg')
      .refine((text) => Buffer.byteLength(text, 'utf8') <= maxDrawingBytes),
    drawing: z
      .string()
      .max(maxDrawingBytes)
      .regex(/^\{[\x20-\x7E]*$/)
      .nullable(),
  })
  .strict();
export const clipboardReadSchema = z.object({}).strict();

// A7 (SPEC-app-shell.md I1, I2, I4, I5; clipboard-export C3, C4). No schema carries a path (R8).
const fileRefId = z.uuid();
const fileKind = z.enum(['chalk', 'png', 'svg', 'pdf']);
/** A base name for a native box or a suggested file name: ≤ 255 characters, no `/` or `\`. */
const baseName = z
  .string()
  .max(255)
  .regex(/^[^/\\]*$/);
export const chooseOpenSchema = z.object({}).strict();
export const readFileSchema = z.object({ ref: fileRefId }).strict();
export const chooseSaveSchema = z.object({ format: fileKind, suggestedName: baseName }).strict();
export const writeFileSchema = z
  .object({
    ref: fileRefId,
    data: z.instanceof(Uint8Array).refine((bytes) => bytes.length <= 64 * 1024 * 1024),
  })
  .strict();
export const askSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('save-changes'), name: baseName }).strict(),
  z.object({ kind: z.literal('recover') }).strict(),
]);
export const fileErrorSchema = z
  .object({
    problem: z.enum([
      'missing',
      'too-large',
      'unsupported',
      'no-drawing',
      'newer-version',
      'damaged',
      'unreadable',
      'write-denied',
      'disk-full',
      'busy',
      'folder-gone',
      'write-failed',
    ]),
    name: baseName,
  })
  .strict();

// A8 (SPEC-app-shell.md N2, N5): the session file by ref (null for Untitled) and the close answer.
export const sessionFileSchema = z.object({ ref: fileRefId.nullable() }).strict();
export const closeOkSchema = z.object({}).strict();
