import { z } from 'zod';

export const logErrorSchema = z.object({ message: z.string().max(4000) }).strict();

export const startupSchema = z.object({}).strict();
/** A11 (M1): the MenuState main builds the menu from; labels come from the editor's history. */
const historyLabel = z.string().max(200).nullable();
const menuStateSchema = z
  .object({
    idle: z.boolean(),
    modal: z.boolean(),
    textFocus: z.boolean(),
    empty: z.boolean(),
    hasSelection: z.boolean(),
    canUndo: z.boolean(),
    canRedo: z.boolean(),
    undoLabel: historyLabel,
    redoLabel: historyLabel,
    canCut: z.boolean(),
    canDuplicate: z.boolean(),
    canDelete: z.boolean(),
    canSelectAll: z.boolean(),
    canZoomIn: z.boolean(),
    canZoomOut: z.boolean(),
    preset: z.enum(['slides', 'journal']),
  })
  .strict();
export const sessionUpdateSchema = z
  .object({ title: z.string().max(300), dirty: z.boolean(), menu: menuStateSchema })
  .strict();

const maxDrawingBytes = 20 * 1024 * 1024;
/** clipboard-export Decision C9: a picture carrier (PNG, SVG) may be up to 64 MiB. */
const maxPictureBytes = 64 * 1024 * 1024;
export const clipboardWriteSchema = z
  .object({
    png: z
      .instanceof(Uint8Array)
      .refine(
        (bytes) =>
          bytes.length <= maxPictureBytes &&
          [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte),
      ),
    svg: z
      .string()
      .startsWith('<svg')
      .refine((text) => Buffer.byteLength(text, 'utf8') <= maxPictureBytes),
    drawing: z
      .string()
      .max(maxDrawingBytes)
      .regex(/^\{[\x20-\x7E]*$/)
      .nullable(),
  })
  .strict();
export const clipboardReadSchema = z.object({}).strict();

// A7 (SPEC-app-shell.md I1, I2, I4, I5; clipboard-export C3, C4). No schema carries a path (R8)
// except I3's below.
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
/** C5 (clipboard-export PD1, C9): an `<svg` of up to 64 MiB of UTF-8; a size in (0, 14 400] pt. */
const pagePt = z.number().refine((n) => Number.isFinite(n) && n > 0 && n <= 14_400);
export const printPdfSchema = z
  .object({
    svg: z
      .string()
      .startsWith('<svg')
      .refine((text) => Buffer.byteLength(text, 'utf8') <= maxPictureBytes),
    widthPt: pagePt,
    heightPt: pagePt,
  })
  .strict();
export const askSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('save-changes'), name: baseName }).strict(),
  z.object({ kind: z.literal('recover') }).strict(),
]);
// I5 (SEC15): `{ problem, name }`; the auto-save and keep boxes add a `context`. Main builds every
// text (`model/messages.ts`); the renderer never sends one.
export const fileErrorSchema = z.union([
  z
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
        'open-in-tab',
      ]),
      name: baseName,
    })
    .strict(),
  z
    .object({
      context: z.literal('auto-save'),
      problem: z.enum([
        'missing',
        'write-denied',
        'disk-full',
        'busy',
        'folder-gone',
        'write-failed',
        'changed-outside',
        'changed-outside-unopenable',
      ]),
      name: baseName,
    })
    .strict(),
  z
    .object({
      context: z.literal('keep'),
      problem: z.enum(['disk-full', 'write-denied', 'write-failed']),
      name: baseName,
    })
    .strict(),
]);

// I10 (SPEC-app-shell.md T15, CM4): which tab, whether Reopen closed tab is offered, and where
// (content CSS px under the tab for a key; null: at the cursor). Only the chosen item comes back.
export const tabMenuSchema = z
  .object({
    tabId: fileRefId,
    state: z.object({ canReopenTab: z.boolean() }).strict(),
    at: z.object({ x: z.number(), y: z.number() }).strict().nullable(),
  })
  .strict();

// A8 (SPEC-app-shell.md N2, N5): the session file by ref (null for Untitled) and the close answer.
export const sessionFileSchema = z.object({ ref: fileRefId.nullable() }).strict();
export const closeOkSchema = z.object({}).strict();

// A10 (SPEC-app-shell.md I8, ST2): a partial RendererSettings; no path, folder, window or recent.
export const setSettingsSchema = z
  .object({
    newDrawingStyle: z.enum(['slides', 'journal']).optional(),
    export: z
      .object({
        format: z.enum(['png', 'svg', 'pdf']),
        pngDpi: z.union([z.literal(150), z.literal(300), z.literal(600)]),
        pngWhite: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict();

// A13 (SPEC-app-shell.md I6, CM1): the canvas context menu's kind and the menu state now.
export const contextMenuSchema = z.object({ onItem: z.boolean(), state: menuStateSchema }).strict();

// A14 (SPEC-app-shell.md N3, N4; RC1, RC2): the committed drawing's text (up to 20 MiB of UTF-8,
// starting "{") and a base name; the clear takes nothing.
export const writeRecoverySchema = z
  .object({
    text: z
      .string()
      .max(maxDrawingBytes)
      .startsWith('{')
      .refine((text) => Buffer.byteLength(text, 'utf8') <= maxDrawingBytes),
    name: baseName,
  })
  .strict();
export const clearRecoverySchema = z.object({}).strict();

// A15 (SPEC-app-shell.md I3, SEC14): the one request that carries a path, sent by the preload
// from `webUtils.getPathForFile` (`''` for a JS-made File, which main answers `unsupported`).
export const fileDroppedSchema = z.object({ path: z.string().max(4096) }).strict();

// TB9 (SPEC-app-shell.md I11, N7, N8; SS2-SS4, SEC8, SEC9): a tab id is a uuid (the only part of a
// store path the renderer names); a record is text main checks only for its `{` signature and its
// size (at most 64 MiB of UTF-8); the index update carries no path and no hash (R8, N8).
const maxRecordBytes = 64 * 1024 * 1024;
const tabId = z.uuid();
export const readTabRecordSchema = z.object({ tabId }).strict();
export const writeTabRecordSchema = z
  .object({
    tabId,
    text: z
      .string()
      .max(maxRecordBytes)
      .startsWith('{')
      .refine((text) => Buffer.byteLength(text, 'utf8') <= maxRecordBytes),
  })
  .strict();
const finite = z.number().refine(Number.isFinite);
const sessionTabSchema = z
  .object({
    id: tabId,
    kind: z.enum(['chalk', 'untitled', 'picture', 'kept']),
    name: baseName,
    view: z
      .object({ zoom: finite, centre: z.object({ x: finite, y: finite }).strict() })
      .strict()
      .nullable(),
    unsaved: z.boolean(),
    warning: z.boolean(),
  })
  .strict();
export const sessionIndexSchema = z
  .object({ tabs: z.array(sessionTabSchema), active: tabId, discarded: z.array(tabId) })
  .strict();
