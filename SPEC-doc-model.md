# Spec: `doc-model`

Shared stack, commands, style and boundaries: see `SPEC.md`. Module map: `CAPABILITY-MAP.md`.

## Objective

The single, pure data layer for a Chalkbond document. Every other module reads documents from
here and changes them only through `doc-model` operations. It knows *structure and geometry*
but no chemistry rules (valence, formulas → `chem-core`) and no drawing (→ `svg-render`).

It must make three things cheap for later modules:
1. **Undo/redo of everything**, including multi-step gestures as one step.
2. **Copy/paste and templates**: extract a sub-document and insert it elsewhere with fresh ids.
3. **Lossless save/open** with a versioned schema that can migrate forward.

## Scope

In: types, id generation, edit operations, transactions + history, invariants, geometry
helpers (bounds, transforms), sub-document extract/insert, serialization + migration.

Out: chemistry perception, rendering, hit-testing on screen, clipboard, file I/O (the module
produces/consumes strings; `app-shell` reads/writes disk).

## Data Model

Coordinates are in **bond-length units (BLU)**: a standard bond is 1.0 long. `svg-render`
multiplies by the style preset's bond length, so switching Slides ↔ Journal style rescales the
whole figure consistently. +y points down (screen convention).

```ts
type AtomId   = Brand<'AtomId'>;    type BondId   = Brand<'BondId'>;
type ObjectId = Brand<'ObjectId'>;  type GroupId  = Brand<'GroupId'>;
type Color    = `#${string}`;       // #rrggbb
type Point    = { x: number; y: number };
type Rect     = { x: number; y: number; w: number; h: number };   // axis-aligned, w,h ≥ 0
type Affine   = [a: number, b: number, c: number, d: number, e: number, f: number];
                                   // x' = a·x + c·y + e ;  y' = b·x + d·y + f  (SVG matrix order)
type ElementSymbol = string;       // validated against PERIODIC_SYMBOLS ∪ {'R','X','*'}

interface Atom {
  id: AtomId;
  x: number; y: number;
  element: ElementSymbol;          // 'C', 'N', 'Cl', …; 'R'/'X' pseudo-atoms allowed
  label?: string;                  // abbreviation/display label: 'Ph', 'OMe', 'CO2H', 'Boc'
  charge: number;                  // -4..+4
  isotope?: number;
  explicitH?: number;              // undefined = automatic (chem-core decides)
  radical: 0 | 1 | 2;              // 0 none, 1 doublet (•), 2 triplet/diradical
  lonePairs?: number;              // displayed lone pairs (teaching annotation), 0..4
  partialCharge?: 'δ+' | 'δ-' | 'δδ+' | 'δδ-';
  number?: string;                 // atom-numbering annotation, e.g. '1', 'α'
  color?: Color;
}

type BondOrder  = 1 | 2 | 3 | 1.5;  // 1.5 = aromatic/delocalized — see "Aromatic rings" below
type BondStereo = 'none' | 'wedge' | 'hash' | 'wavy' | 'bold';

interface Bond {
  id: BondId;
  a1: AtomId; a2: AtomId;          // wedge/hash narrow end at a1
  order: BondOrder;
  stereo: BondStereo;
  doublePlacement: 'auto' | 'center' | 'left' | 'right';
  color?: Color;
}

/** Attachment point for curved arrows and callouts; follows the structure when it moves. */
type Anchor =
  | { kind: 'point'; p: Point }
  | { kind: 'atom'; atom: AtomId; offset?: Point }       // offset → e.g. a lone pair
  | { kind: 'bond'; bond: BondId; t?: number };          // t ∈ [0,1] along bond, default .5

type ArrowKind = 'forward' | 'equilibrium' | 'retro' | 'resonance' | 'no-go';

type DrawObject =
  | { type: 'arrow'; id: ObjectId; kind: ArrowKind; from: Point; to: Point }
  | { type: 'curved-arrow'; id: ObjectId; head: 'full' | 'fishhook';
      from: Anchor; to: Anchor; bend: number }           // bend: signed curvature
  | { type: 'plus'; id: ObjectId; at: Point }
  | { type: 'text'; id: ObjectId; at: Point; runs: TextRun[];
      align: 'left' | 'center' | 'right';
      attachedTo?: { arrow: ObjectId; slot: 'above' | 'below' } }   // reaction conditions
  | { type: 'caption'; id: ObjectId; runs: TextRun[]; target: AtomId[] } // compound number under a structure
  | { type: 'callout'; id: ObjectId; at: Point; runs: TextRun[]; anchor: Anchor }
  | { type: 'bracket'; id: ObjectId; shape: 'square' | 'round' | 'curly';
      rect: Rect; corner?: TextRun[] }                   // e.g. ‡, n, 2+
  | { type: 'shape'; id: ObjectId; shape: 'rect' | 'ellipse'; rect: Rect;
      stroke?: Color; fill?: Color; fillOpacity: number };  // highlights

interface TextRun {
  text: string;
  script?: 'sub' | 'sup';
  bold?: boolean; italic?: boolean;
  color?: Color;
}

interface Group { id: GroupId; members: { atoms: AtomId[]; objects: ObjectId[] } }

interface Doc {
  schemaVersion: 2;                // in memory always 2; a file may say 1 (see "File Format", D1)
  atoms:   Record<AtomId, Atom>;
  bonds:   Record<BondId, Bond>;
  objects: Record<ObjectId, DrawObject>;
  zOrder:  ObjectId[];             // paint order of objects; atoms/bonds paint below objects,
                                   // except 'shape' highlights, which paint beneath structures
  groups:  Record<GroupId, Group>;
  nextId:  number;                 // id counter; ids are 'a12', 'b7', 'o3', 'g1' (prefix + n)
  style:   { preset: 'slides' | 'journal'; overrides: Partial<StyleSettings>;
             formula?: 'structural' };
                                   // StyleSettings (final; meaning defined in SPEC-svg-render.md):
                                   // bondLength, lineWidth, doubleBondSpacing, fontFamily, fontSize.
                                   // formula (schema v2, D1): absent = skeletal formula (the
                                   // default, every file before v2); 'structural' = every carbon
                                   // without a label is written with its hydrogens (CH3, CH2 …).
                                   // A display setting of the whole document: atoms, bonds and
                                   // coordinates are untouched by it. Meaning: SPEC-svg-render.md
  meta:    { title?: string; created: string; modified: string };  // ISO 8601
}
```

**Molecules are not stored.** A molecule (fragment) is a connected component of the atom/bond
graph, derived on demand via `fragments(doc)`. Bonding two fragments together or deleting a
bridging bond needs no bookkeeping.

**Aromatic rings need no extra object.** Aromaticity is stored on bonds as `order: 1.5`.
`svg-render` draws a ring whose bonds are *all* 1.5 as single lines with an inscribed circle
(the default look; fused systems like naphthalene get one circle per ring). A 1.5 bond that is
not part of such a ring (e.g. carboxylate, allyl) is drawn as a line plus a dashed line. The
editor's "Kekulé ↔ circle" toggle rewrites bond orders via `chem-core` (kekulize/aromatize),
so no extra `DrawObject` variant or document flag exists for it. (The one document-level display
flag, `style.formula`, is a different feature: structural versus skeletal formula, D1.)

**Reactions are not stored as semantic objects.** A reaction is arrows, plus signs, fragments and
conditions text in space. `editor`'s Tidy reaction infers the scheme from layout. (Reaction
SMILES export, if ever wanted, would infer it the same way.)

## Public API

All functions are pure and return a new `Doc`. They throw `DocError` (with a `code`) for
references to unknown ids (`unknown-atom` …), forbidden edits (`self-bond`, `duplicate-bond`,
`invalid-attachment`) and values that would break invariant 7/8 (`invalid-value`), so no op can
produce an invalid doc. Callers normally go through `History.transact`.

Ops are Immer recipes underneath. Called on a frozen `Doc` they return a new doc; called on the
draft that `transact` passes to its recipe they mutate that draft and return it, which gives
`transact` fine-grained patches. A recipe must therefore thread the doc each op returns and
not read an earlier version expecting it to be unchanged. In `update*` patches, `undefined`
clears an optional field; `id` (and a bond's `a1`/`a2`) can't be changed.

```ts
// creation
emptyDoc(now: string): Doc
// Ids come from doc.nextId inside each add*/insert op — no global state, no randomness, so
// every op is deterministic and undo restores the counter. Ids are unique within a doc; an
// id freed by undo may be issued again by the next op, so callers (editor selection, etc.)
// must not hold ids across undo/redo.

// atoms & bonds
addAtom(doc, init: Partial<Omit<Atom,'id'>> & Point): [Doc, AtomId]   // default: neutral C
addBond(doc, a1, a2, init?: Partial<Bond>): [Doc, BondId] // rejects self-bond / duplicate pair
updateAtom(doc, id, patch: Partial<Omit<Atom,'id'>>): Doc
updateBond(doc, id, patch: Partial<Omit<Bond,'id'|'a1'|'a2'>>): Doc
mergeAtoms(doc, keep: AtomId, drop: AtomId): Doc          // re-points drop's bonds to keep;
                                                          // collapses resulting duplicates
resolveAnchor(doc, anchor): Point               // atom pos + offset, or point at t on a bond
// objects
addObject(doc, obj: DistributiveOmit<DrawObject,'id'>): [Doc, ObjectId]
updateObject(doc, id, patch): Doc               // id/type never change
paintLayers(doc): { beneath: ObjectId[]; above: ObjectId[] }  // shapes | everything else
// zOrder always lists `shape` highlights first, then other objects; a new object goes on top
// of its layer. A text's `attachedTo` must name an existing arrow ('invalid-attachment');
// a caption needs ≥ 1 target atom.

// selection-based
type Selection = { atoms: Set<AtomId>; bonds: Set<BondId>; objects: Set<ObjectId> };
deleteItems(doc, sel): Doc        // cascades: atom → its bonds; arrow → its attached texts
transformItems(doc, sel, m: Affine): Doc   // move / rotate / flip / scale. Points, atoms,
                                           // arrow ends and point anchors transform exactly;
                                           // atom/bond anchors follow their atom. Rects
                                           // (bracket/shape) stay axis-aligned: centre maps
                                           // exactly, size → bbox of the mapped inscribed
                                           // ellipse (w' = hypot(a·w, c·h), h' = hypot(b·w,
                                           // d·h)): exact for 90° turns (w/h swap), flips and
                                           // scales; circles keep size under any rotation.
                                           // Mirroring (det < 0) negates curved-arrow `bend`
                                           // (bend is dimensionless, relative to the chord).
                                           // Selected bonds bring their atoms; selected arrows
                                           // bring their attached texts.
bounds(doc, sel?): Rect | null             // geometric hull (BLU) of atom positions, arrow
                                           // ends, points, rects, resolved anchors, caption
                                           // targets; no label/stroke extents (svg-render adds)
IDENTITY, applyAffine, translation(dx,dy), rotation(rad, center?), scaling(sx, sy?, center?)

// style
setStyle(doc, patch: { preset?: StylePreset; overrides?: Partial<StyleSettings>;
                       formula?: 'skeletal' | 'structural' }): Doc
  // preset ∈ {'slides','journal'}; overrides replaces the whole object, validated like the schema;
  // formula (D1, 2026-11-12): 'structural' sets style.formula, 'skeletal' removes the key (so a
  // switch and its reverse give a doc deep-equal to the start); any other value →
  // DocError('invalid-value'). A patch that changes nothing changes nothing (no history step).

// derived structure
fragments(doc): AtomId[][]                     // connected components, deterministic order
neighbors(doc, atomId): AtomId[]                // sorted by id number
findBond(doc, a1, a2): BondId | undefined       // either direction

// sub-documents (copy/paste, templates, name insert)
type SubDoc = Pick<Doc, 'atoms' | 'bonds' | 'objects' | 'zOrder' | 'groups'>  // plain JSON,
                                                // ids local to the sub-doc, centred on (0,0)
extract(doc, sel): SubDoc                       // closed over selection: selected bonds bring
                                                // their atoms; a bond is kept iff both atoms
                                                // are; anchors to atoms/bonds left behind
                                                // become point anchors; arrows bring attached
                                                // texts (a text without its arrow loses
                                                // attachedTo); captions/groups keep only
                                                // extracted members (empty ones dropped);
                                                // result centred on the origin
insert(doc, sub: SubDoc, at: Point): [Doc, Selection]   // validates sub (invariants), fresh
                                                // ids in id order, origin lands at `at`,
                                                // returns what was inserted
everything(doc): Selection                      // every atom, bond and object

// history
interface History { /* immutable */ }
createHistory(doc, opts?: { clock?: () => string }): History  // clock → meta.modified (ISO)
transact(h, label: string, recipe: (doc) => Doc, opts?: { coalesceKey?: string }): History
undo(h): History;  redo(h): History
current(h): Doc;   canUndo(h); canRedo(h); undoLabel(h); redoLabel(h)

// persistence
serialize(doc): string                          // stable key order, 2-space JSON
parse(text: string): Result<Doc, ParseError>    // validates with the file's own version's schema, runs migrations, re-validates, checks invariants (D1)
// Result = { ok: true; value } | { ok: false; error }; ParseError = { code, message, details? }
// codes: too-large | invalid-json | not-chalkbond | newer-version | unsupported-version |
//        migration-failed | schema | invariants  (details: first 10 issues/violations)
checkInvariants(doc): InvariantViolation[]
```

### Cascade rules (deleteItems / mergeAtoms)

| Deleted | Effect |
|---|---|
| atom | its bonds deleted; `caption.target` loses the atom (caption deleted if empty); anchors to it → `point` at its last position |
| bond | anchors to it → `point` at the anchor's last position |
| arrow | texts with `attachedTo.arrow` = it are deleted |
| any | removed from `zOrder` and group memberships; empty groups deleted |

"Last position" means the anchor's resolved position (atom position + `offset`; point at `t`
along the bond), computed before anything is removed.

`mergeAtoms(keep, drop)` is not a delete of `drop`: `drop`'s bonds move to `keep` (direction
kept); a bond that would duplicate one of `keep`'s collapses into it (`keep`'s bond survives);
the keep–drop bond is deleted. Atom anchors and caption targets on `drop` move to `keep`
(captions deduplicated); bond anchors on a collapsed bond move to the survivor (`t` flipped if
its direction is reversed); anchors on the deleted keep–drop bond become point anchors; `drop`
leaves its group.

### History

- Implemented with Immer `produceWithPatches`; history stores patch/inverse-patch pairs, not
  snapshots.
- `coalesceKey`: consecutive transactions with the same key merge into one undo step (a drag
  emits many moves → one undo).
- Depth limit 500 steps; oldest dropped.
- A new transaction after undo clears the redo stack.
- `meta.modified` is set by `transact` (from the history's injectable clock) inside the same
  step, so undo restores the previous value too. A recipe that changes nothing records no step.
- Coalescing applies only while the run is unbroken: a transact with another key or no key,
  or any undo/redo, ends it.

## File Format

- Extension **`.chalk`**, UTF-8 JSON, `{ "format": "chalkbond", "schemaVersion": 1 | 2, "doc": … }`
  (`serialize` writes the same version in the envelope and in the doc).
- `parse` rejects: wrong `format`, malformed JSON, schema violations, invariant violations
  (with a message listing the first 10), files > 20 MB, and `schemaVersion` newer than this
  build ("created by a newer version of Chalkbond").
- Older versions run through `migrations[n] : (v_n) => v_{n+1}` in sequence. `migrations[1]`
  (v1 → v2, D1) sets `schemaVersion` to 2 and changes nothing else (a v1 document has no
  `formula`, which means skeletal). Each version has its own strict Zod schema: v1 is the schema
  of 1.0.0 unchanged (a `formula` key in a v1 file is rejected as an unknown key); v2 adds only
  `style.formula: 'structural'` (optional; any other value, `'skeletal'` included, is rejected).
- **Version written (D1):** `serialize` writes the lowest version that can hold the document:
  `schemaVersion: 1` (envelope and doc) when `style.formula` is absent, `2` when it is
  `'structural'`. Every byte `serialize` wrote before v2 is therefore unchanged for every document
  without `formula`: committed fixtures and goldens, recovery files, clipboard payloads and
  pictures' embedded drawings stay byte-identical, and a skeletal drawing saved, exported or
  copied by the new build still opens in, and pastes into, the 1.0.0 build tested by the owner
  on 2026-11-12 (which only knows v1). A structural drawing is v2: the 1.0.0 build refuses it with
  its `newer-version` message (app-shell F14 "made with a newer version of Chalkbond"; clipboard
  N-P3), which is true and changes nothing. `parse(serialize(doc))` deep-equals `doc` for both
  versions (a v1 file parses to an in-memory v2 doc without `formula`).
- **Where a file is validated (D1):** a file is validated with the strict schema of **its own
  version**, and only then migrated: `parse` reads the envelope, checks the version (`unsupported-version`,
  `newer-version`), validates `doc` with `schemas[version]` (v1 → the v1 schema, v2 → the v2
  schema; each pins `schemaVersion` to its own literal, so an envelope and a doc that disagree are
  a `schema` error), runs `migrations[version]` … `migrations[CURRENT_SCHEMA_VERSION - 1]` in sequence, and validates the
  result once more with the current schema (this second pass catches a faulty migration,
  `migration-failed` is for a migration that throws). Validating only after migration would be
  wrong: a v1 file that carries `formula` would migrate to v2 and pass, although v1 has no such
  key. `parseWith(text, migrations, currentVersion, schemas)` is the test harness with a schema
  per version: `schemas` is a `Readonly<Record<number, ZodType>>` that defaults to the real table
  (`{ 1: DOC_SCHEMA_V1, 2: DOC_SCHEMA_V2 }`); a version with no entry is `unsupported-version`; a
  test that runs a synthetic v0 passes its own table (the v0 shape is not a `Doc`, so its entry is
  a permissive `z.unknown()` and the real v1 and v2 schemas follow) and the final pass uses
  `schemas[currentVersion]`.
- **`CURRENT_SCHEMA_VERSION` (D1) is 2:** the newest version this build reads and the
  `schemaVersion` of every in-memory `Doc`; `parse` rejects anything above it as `newer-version`.
  It is no longer what `serialize` writes: `serialize` writes `1` or `2` by the rule above (an
  internal `fileVersion(doc)`, not exported; the public surface keeps its names), in the envelope
  and in the written `doc`.
- `serialize` is deterministic: same doc → byte-identical output (stable diffs, golden tests).
  Record entries are ordered by id number; other keys lead with `format, schemaVersion, id,
  type, kind, x, y, w, h`, then alphabetical; `-0` is written as `0`; trailing newline.
- The Zod schema (`schema.ts`) is strict: unknown keys are rejected, so a file is never
  silently truncated. Consequently **any** new field — even optional — bumps `schemaVersion`
  with a migration. A compile-time identity check keeps `z.infer<schema>` equal to `Doc`.

## Invariants (`checkInvariants`)

1. Every bond's `a1`, `a2` exist and differ.
2. At most one bond per unordered atom pair.
3. Every id in `zOrder` exists in `objects`, exactly once, and every object is in `zOrder`.
4. Every `atom` / `bond` anchor and `caption.target` id exists.
5. Every `attachedTo.arrow` refers to an object of type `arrow`.
6. Group members exist; an item belongs to at most one group.
7. All coordinates finite; `charge` an integer in [-4, 4]; colours match `#rrggbb`;
   `fillOpacity` ∈ [0,1]; `Rect` `w`, `h` ≥ 0; bond-anchor `t` ∈ [0,1].
8. `nextId` is a positive integer; every id is `<prefix><n>` with the right prefix for its kind,
   is stored under its own key, and has `n` < `nextId`; element symbols are valid.

Each violation is `{ invariant: 1…8, code, id?, message }`; `code` is a stable string
(`'duplicate-bond'`, `'zorder-missing-object'`, …) that tests and `parse` errors use.

## Testing

- Unit tests for every public function, including each cascade rule row.
- Property tests (fast-check): random sequences of 1–50 operations from a generator covering
  every op →
  - `checkInvariants` is empty after every step;
  - undo all → doc deep-equals the start; redo all → deep-equals the end;
  - `parse(serialize(doc))` deep-equals `doc`;
  - `insert(extract(doc, everything))` into an empty doc preserves atom/bond/object counts
    and relative geometry.
- Migration harness test with a synthetic v0 → v1 migration fixture.
- Schema v2 (D1): every committed v1 fixture (`__fixtures__/*.chalk`, svg-render's
  `__golden__/inputs/*.chalk`) parses, and `serialize` of the result is byte-identical to the
  file; a v2 file with `formula: 'structural'` round-trips; a v1 file with a `formula` key, a v2
  file with `formula: 'skeletal'` or any other value, and `schemaVersion: 3` are rejected with
  `schema` / `newer-version` (the v1-with-`formula` case proves the own-version validation rule: a
  migrate-then-validate `parse` would accept it);
  `setStyle` with `formula` inside `transact` is one undo step and its reverse returns a doc
  deep-equal to the start; the property-test command generator gains the `formula` patch of
  `setStyle` (round-trip and undo properties then cover v2; `numRuns` unchanged).
- Test-support code lives in `__fixtures__/` (excluded from coverage): the property-test
  command generator (`arbitraries.ts`), fixture builders (`schemes.ts`) and golden `.chalk`
  files, which are `serialize` output of those builders (a test keeps the two in sync).
- The generator test asserts every op actually applies (not just gets generated) many times.
- Perf check (unit test with timing budget): `transact` on a 500-atom doc < 2 ms median;
  `fragments` on 500 atoms < 1 ms.

**Test and code changes that follow from D1 (2026-11-12).** They follow the spec change; no
assertion is deleted or weakened, each old expectation is replaced by the new rule's. Checked
against the tree at `469f371`.

| File | Change |
|---|---|
| `types.ts` | `Doc.schemaVersion: 2` (was `1`) |
| `schema.ts` | the v1 schema stays exactly as it is (it is tied to a private `DocV1` type, no longer to `Doc`); a v2 schema is added and the compile-time identity check ties it to `Doc` |
| `migrations.ts` | `CURRENT_SCHEMA_VERSION = 2`; `MIGRATIONS[1]` (v1 to v2, sets `schemaVersion: 2`) |
| `serialize.ts` | `parseWith` gains the `schemas` parameter and validates by own version (File Format); `serialize` writes `fileVersion(doc)` instead of `CURRENT_SCHEMA_VERSION` |
| `doc.ts` | `emptyDoc` literal `schemaVersion: 2` |
| `subdoc.ts` | `asDoc` builds its `Doc` literal with `schemaVersion: 2` |
| `__fixtures__/kitchen-sink.ts` | the `Doc` literal `schemaVersion: 2` (it serialises as v1, no `formula`) |
| `doc.test.ts` | the `emptyDoc` expectation `schemaVersion: 1` becomes `2` (title "an empty v2 doc"); the public-surface list is unchanged (the name `CURRENT_SCHEMA_VERSION` stays exported) |
| `serialize.test.ts` | "newer schemaVersion" pins `schemaVersion: 2` as `newer-version`: it becomes `3`; the tests that wrap an in-memory doc in the `file()` helper's v1 envelope (the schema-violation tests that list issue details) set `doc.schemaVersion = 1` first, since the v1 schema pins its literal (otherwise the details gain a `schemaVersion` issue); the migration-harness tests pass a `schemas` table (synthetic v0: `z.unknown()`); the first test ("writes the envelope", `emptyDoc` has no `formula`) keeps its v1 bytes unchanged and now also proves D1 |
| unchanged, proving v1 bytes did not move | every other `serialize` expectation, `file-flows.test.ts`, `copy-flow.test.ts`, `recovery.test.ts` and the e2e files that replace `"schemaVersion": 1` by `999` (a skeletal doc is still written as v1) |

## Success Criteria

1. Every type and function above exists with tests; `src/core/doc-model` line coverage ≥ 95%.
2. All property tests pass at 1,000 runs each.
3. No import of `react`, `electron`, `node:*`, `openchemlib` or DOM types in the module
   (lint rule passes).
4. A drag of 200 move events produces exactly one undo step.
5. Hand-written fixture docs for benzene, a 2-step reaction scheme with conditions, and a
   mechanism with curved arrows round-trip through `serialize`/`parse` unchanged.

## Boundaries (module-specific)

- **Always:** keep `Doc` JSON-serializable (no Maps/Sets/classes inside `Doc`); every new field
  is optional or has a migration.
- **Ask first:** adding a new `DrawObject` variant or `Atom` field once `editor` work has
  started (it ripples into render, editor and file format).
- **Never:** encode chemistry rules here (e.g. "carbon has 4 bonds") — that is `chem-core`.

## Decisions

Rows added after approval; a later row supersedes older text anywhere in this file.

| # | Decision | Reason | Date |
|---|---|---|---|
| D1 | **Schema v2: `style.formula?: 'structural'`** for the structural formula display (`SPEC-editor.md` R51, `SPEC-svg-render.md` Decision 15). Approved by the owner's request of 2026-11-12 (the orchestrator recorded it as the approval of the schema change). In memory every `Doc` is v2; absent `formula` means skeletal. `migrations[1]` v1 → v2 only sets the version. `serialize` writes v1 when `formula` is absent and v2 when it is `'structural'` ("lowest version that holds the document"). `setStyle` gains `formula`; `'skeletal'` deletes the key. The value set is the single literal `'structural'` so that one state has one representation (no `formula: 'skeletal'`) | A strict schema needs a version bump for any new key. Writing v1 whenever possible keeps every existing byte (fixtures, goldens, recovery, payloads) and keeps skeletal drawings from the new build readable by the 1.0.0 build the owner tested; a structural drawing cannot be shown correctly by 1.0.0, so it is v2 and refused there with the honest "newer version" message. The setting lives in `style` because, like the preset, it is how the whole document is drawn and travels with every save, copy and export | 2026-11-12 |

## Open Questions

None. (Resolved 2026-11-09: aromatic rings default to circle-in-ring, stored as all-1.5 bonds.)
