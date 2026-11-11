import { parse, extract, everything, type SubDoc } from '../doc-model';
export type ClipboardContents = {
  drawing: string | null;
  text: string | null;
  textTooLong: boolean;
  image: boolean;
};
export type PasteAction =
  | { kind: 'in-app' }
  | { kind: 'fragment'; sub: SubDoc }
  | { kind: 'text'; text: string }
  | { kind: 'notice'; notice: 'picture-only' | 'empty' | 'newer' | 'damaged' | 'text-too-long' };
export function pasteAction(
  clip: ClipboardContents,
  lastEditorCopy: string | null,
  inAppReady: boolean,
): PasteAction {
  if (clip.drawing !== null) {
    const parsed = parse(clip.drawing);
    if (!parsed.ok)
      return {
        kind: 'notice',
        notice: parsed.error.code === 'newer-version' ? 'newer' : 'damaged',
      };
    if (clip.drawing === lastEditorCopy && inAppReady) return { kind: 'in-app' };
    return { kind: 'fragment', sub: extract(parsed.value, everything(parsed.value)) };
  }
  if (clip.textTooLong) return { kind: 'notice', notice: 'text-too-long' };
  if (clip.text) return { kind: 'text', text: clip.text };
  return { kind: 'notice', notice: clip.image ? 'picture-only' : 'empty' };
}
