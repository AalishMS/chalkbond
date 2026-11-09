import { z } from 'zod';
import type { AtomId, BondId, Color, Doc, GroupId, ObjectId } from './types';

// Zod schema for a v1 `Doc`: the single source of file validation. Structure, enums and
// per-field ranges live here; cross-references and invariants are checked by checkInvariants.
// Objects are strict: unknown keys are rejected so a file is never silently truncated.

// Branded / template-literal types can't be inferred by Zod; these casts are checked against
// the hand-written types by the compile-time assertion at the bottom of this file.
const atomId = z.string().regex(/^a[1-9]\d*$/) as unknown as z.ZodType<AtomId>;
const bondId = z.string().regex(/^b[1-9]\d*$/) as unknown as z.ZodType<BondId>;
const objectId = z.string().regex(/^o[1-9]\d*$/) as unknown as z.ZodType<ObjectId>;
const groupId = z.string().regex(/^g[1-9]\d*$/) as unknown as z.ZodType<GroupId>;
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/) as unknown as z.ZodType<Color>;

const point = z.strictObject({ x: z.number(), y: z.number() });
const rect = z.strictObject({
  x: z.number(),
  y: z.number(),
  w: z.number().min(0),
  h: z.number().min(0),
});

const atom = z.strictObject({
  id: atomId,
  x: z.number(),
  y: z.number(),
  element: z.string().min(1),
  label: z.string().optional(),
  charge: z.number().int().min(-4).max(4),
  isotope: z.number().int().positive().optional(),
  explicitH: z.number().int().min(0).optional(),
  radical: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  lonePairs: z.number().int().min(0).max(4).optional(),
  partialCharge: z.enum(['δ+', 'δ-', 'δδ+', 'δδ-']).optional(),
  number: z.string().optional(),
  color: color.optional(),
});

const bond = z.strictObject({
  id: bondId,
  a1: atomId,
  a2: atomId,
  order: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(1.5)]),
  stereo: z.enum(['none', 'wedge', 'hash', 'wavy', 'bold']),
  doublePlacement: z.enum(['auto', 'center', 'left', 'right']),
  color: color.optional(),
});

const anchor = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('point'), p: point }),
  z.strictObject({ kind: z.literal('atom'), atom: atomId, offset: point.optional() }),
  z.strictObject({ kind: z.literal('bond'), bond: bondId, t: z.number().min(0).max(1).optional() }),
]);

const textRun = z.strictObject({
  text: z.string(),
  script: z.enum(['sub', 'sup']).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  color: color.optional(),
});
const runs = z.array(textRun).readonly();

const drawObject = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('arrow'),
    id: objectId,
    kind: z.enum(['forward', 'equilibrium', 'retro', 'resonance', 'no-go']),
    from: point,
    to: point,
  }),
  z.strictObject({
    type: z.literal('curved-arrow'),
    id: objectId,
    head: z.enum(['full', 'fishhook']),
    from: anchor,
    to: anchor,
    bend: z.number(),
  }),
  z.strictObject({ type: z.literal('plus'), id: objectId, at: point }),
  z.strictObject({
    type: z.literal('text'),
    id: objectId,
    at: point,
    runs,
    align: z.enum(['left', 'center', 'right']),
    attachedTo: z.strictObject({ arrow: objectId, slot: z.enum(['above', 'below']) }).optional(),
  }),
  z.strictObject({
    type: z.literal('caption'),
    id: objectId,
    runs,
    target: z.array(atomId).min(1).readonly(),
  }),
  z.strictObject({ type: z.literal('callout'), id: objectId, at: point, runs, anchor }),
  z.strictObject({
    type: z.literal('bracket'),
    id: objectId,
    shape: z.enum(['square', 'round', 'curly']),
    rect,
    corner: runs.optional(),
  }),
  z.strictObject({
    type: z.literal('shape'),
    id: objectId,
    shape: z.enum(['rect', 'ellipse']),
    rect,
    stroke: color.optional(),
    fill: color.optional(),
    fillOpacity: z.number().min(0).max(1),
  }),
]);

const group = z.strictObject({
  id: groupId,
  members: z.strictObject({
    atoms: z.array(atomId).readonly(),
    objects: z.array(objectId).readonly(),
  }),
});

const styleSettings = z.strictObject({
  bondLength: z.number().positive().optional(),
  lineWidth: z.number().positive().optional(),
  doubleBondSpacing: z.number().positive().optional(),
  fontFamily: z.string().optional(),
  fontSize: z.number().positive().optional(),
});

export const DOC_SCHEMA_V1 = z.strictObject({
  schemaVersion: z.literal(1),
  atoms: z.record(atomId, atom),
  bonds: z.record(bondId, bond),
  objects: z.record(objectId, drawObject),
  zOrder: z.array(objectId).readonly(),
  groups: z.record(groupId, group),
  nextId: z.number().int().positive(),
  style: z.strictObject({ preset: z.enum(['slides', 'journal']), overrides: styleSettings }),
  meta: z.strictObject({
    title: z.string().optional(),
    created: z.string(),
    modified: z.string(),
  }),
});

// ── Compile-time check: the schema's type matches the hand-written `Doc`. ──────────────────
type DeepReadonly<T> = T extends string | number | boolean | undefined
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : { readonly [K in keyof T]: DeepReadonly<T[K]> };
// Identity check (stricter than mutual assignability, which misses a dropped optional field).
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const schemaMatchesDoc: Equals<
  DeepReadonly<z.infer<typeof DOC_SCHEMA_V1>>,
  DeepReadonly<Doc>
> = true;
void schemaMatchesDoc;
