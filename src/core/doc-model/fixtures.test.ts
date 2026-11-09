import { describe, expect, it } from 'vitest';
import benzeneText from './__fixtures__/benzene.chalk?raw';
import mechanismText from './__fixtures__/mechanism.chalk?raw';
import { benzeneDoc, mechanismDoc, twoStepReactionDoc } from './__fixtures__/schemes';
import reactionText from './__fixtures__/two-step-reaction.chalk?raw';
import { fragments } from './graph';
import { checkInvariants } from './invariants';
import { parse, serialize } from './serialize';
import type { Doc } from './types';

const FIXTURES: [string, string, () => Doc][] = [
  ['benzene', benzeneText, benzeneDoc],
  ['two-step reaction with conditions', reactionText, twoStepReactionDoc],
  ['mechanism with curved arrows', mechanismText, mechanismDoc],
];

describe('golden .chalk fixtures', () => {
  it.each(FIXTURES)('%s round-trips through parse/serialize unchanged', (_name, text, build) => {
    const r = parse(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serialize(r.value)).toBe(text);
    expect(r.value).toEqual(build());
    expect(checkInvariants(r.value)).toEqual([]);
  });

  it('contain what their names say', () => {
    const benzene = benzeneDoc();
    expect(Object.values(benzene.bonds).map((b) => b.order)).toEqual(Array(6).fill(1.5));

    const reaction = twoStepReactionDoc();
    expect(fragments(reaction)).toHaveLength(3);
    const objects = Object.values(reaction.objects);
    expect(objects.filter((o) => o.type === 'arrow')).toHaveLength(2);
    expect(objects.filter((o) => o.type === 'text' && o.attachedTo)).toHaveLength(4);
    expect(objects.filter((o) => o.type === 'caption')).toHaveLength(3);

    const mechanism = mechanismDoc();
    const anchorKinds = Object.values(mechanism.objects).flatMap((o) =>
      o.type === 'curved-arrow' ? [o.from.kind, o.to.kind] : [],
    );
    expect(anchorKinds.sort()).toEqual(['atom', 'atom', 'atom', 'bond']);
  });
});
