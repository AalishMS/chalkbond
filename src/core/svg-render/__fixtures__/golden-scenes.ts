// Test helper: the golden scene list. Inputs are the frozen `.chalk` files in
// `__golden__/inputs/` (produced once from chem-core's parsers, then committed) plus doc-model's
// own fixtures. Every scene is rendered in both style presets.
import { parse, type Doc, type Selection, type StylePreset } from '../../doc-model';
import { kitchenSinkDoc } from '../../doc-model/__fixtures__/kitchen-sink';
import benzeneText from '../../doc-model/__fixtures__/benzene.chalk?raw';
import mechanismText from '../../doc-model/__fixtures__/mechanism.chalk?raw';
import reactionText from '../../doc-model/__fixtures__/two-step-reaction.chalk?raw';

export const PRESETS: readonly StylePreset[] = ['slides', 'journal'];

export interface GoldenScene {
  readonly name: string;
  readonly doc: Doc;
  /** Draw only this part of the document. */
  readonly only?: Selection;
}

function load(name: string, text: string): Doc {
  const r = parse(text);
  if (!r.ok) throw new Error(`golden input ${name}: ${r.error.message}`);
  return r.value;
}

const FILES = import.meta.glob('../__golden__/inputs/*.chalk', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Scenes in a fixed order: the frozen inputs by name, doc-model's fixtures, then the subset. */
export function goldenScenes(): GoldenScene[] {
  const scenes: GoldenScene[] = Object.keys(FILES)
    .sort()
    .map((path) => {
      const name = path.replace(/^.*\//, '').replace(/\.chalk$/, '');
      return { name, doc: load(name, FILES[path] as string) };
    });
  scenes.push(
    { name: 'benzene-fixture', doc: load('benzene', benzeneText) },
    { name: 'two-step-reaction', doc: load('two-step-reaction', reactionText) },
    { name: 'mechanism', doc: load('mechanism', mechanismText) },
    { name: 'kitchen-sink', doc: kitchenSinkDoc() },
  );
  // A subset: the first step of the two-step reaction (its molecule and its arrow).
  const reaction = load('two-step-reaction', reactionText);
  const atoms = Object.values(reaction.atoms).filter((a) => a.x < 3.5);
  const first = Object.values(reaction.objects).find((o) => o.type === 'arrow');
  scenes.push({
    name: 'subset-two-step-reaction',
    doc: reaction,
    only: {
      atoms: new Set(atoms.map((a) => a.id)),
      bonds: new Set(
        Object.values(reaction.bonds)
          .filter((b) => b.a1 in reaction.atoms && atoms.some((a) => a.id === b.a1))
          .map((b) => b.id),
      ),
      objects: new Set(first ? [first.id] : []),
    },
  });
  return scenes;
}
