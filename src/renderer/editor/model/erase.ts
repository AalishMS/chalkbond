// What an erase takes away, as the keys of the parts that show it (SPEC-editor.md E1, E2): the
// Erase tool ghosts these while the pointer is down.
import type { AtomId, Doc, Selection } from '@core/doc-model';
import type { Scene } from '@core/svg-render';
import { deleteWithOrphans } from './cleanup';

/**
 * The keys of the parts of `scene` that disappear when `sel` is erased from `doc`: the selected
 * items, what depends on them (a bond of an erased atom) and the carbons the orphan rule takes
 * with them. Parts are keyed `atom:id`, `bond:id`, `obj:id` and `ring:id,id,...` (a ring circle
 * goes when any of its atoms does).
 */
export function erasedKeys(doc: Doc, scene: Scene, sel: Selection): string[] {
  const after = deleteWithOrphans(doc, sel);
  const keys: string[] = [];
  for (const id of Object.keys(doc.atoms)) if (!(id in after.atoms)) keys.push(`atom:${id}`);
  for (const id of Object.keys(doc.bonds)) if (!(id in after.bonds)) keys.push(`bond:${id}`);
  for (const id of Object.keys(doc.objects)) if (!(id in after.objects)) keys.push(`obj:${id}`);
  for (const part of scene.parts) {
    if (!part.key.startsWith('ring:')) continue;
    const atoms = part.key.slice('ring:'.length).split(',');
    if (atoms.some((id) => !((id as AtomId) in after.atoms))) keys.push(part.key);
  }
  return keys;
}
