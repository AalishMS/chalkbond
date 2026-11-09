import { castDraft } from 'immer';
import { checkAnchor } from './anchors';
import { assertNever } from './assert-never';
import { allocId, edit } from './edit';
import { DocError } from './errors';
import type { DistributiveOmit, Doc, DrawObject, ObjectId, Rect, TextRun } from './types';
import { applyPatch, checkColor, checkFinite, checkPoint, invalid, settable } from './validate';
import { addToZOrder } from './z-order';

export type ObjectInit = DistributiveOmit<DrawObject, 'id'>;
/** Fields of one variant, minus `id` and `type` (which never change). */
export type ObjectPatch = Partial<DistributiveOmit<DrawObject, 'id' | 'type'>>;

const IMMUTABLE = ['id', 'type'];

const REQUIRED: Record<DrawObject['type'], readonly string[]> = {
  arrow: ['kind', 'from', 'to'],
  'curved-arrow': ['head', 'from', 'to', 'bend'],
  plus: ['at'],
  text: ['at', 'runs', 'align'],
  caption: ['runs', 'target'],
  callout: ['at', 'runs', 'anchor'],
  bracket: ['shape', 'rect'],
  shape: ['shape', 'rect', 'fillOpacity'],
};

/** Adds a draw object on top of its paint layer and returns its id. */
export function addObject(doc: Doc, init: ObjectInit): [Doc, ObjectId] {
  const fields = settable(init, ['id'], true) as ObjectInit;
  checkObject(doc, fields, undefined);
  return edit(doc, (d) => {
    const id = allocId(d, 'object');
    const obj = { ...fields, id } as DrawObject;
    d.objects[id] = castDraft(obj);
    addToZOrder(d, obj);
    return id;
  });
}

/** Changes fields of an object (not its `id` or `type`); `undefined` clears an optional one. */
export function updateObject(doc: Doc, id: ObjectId, patch: ObjectPatch): Doc {
  const current = doc.objects[id];
  if (!current) throw new DocError('unknown-object', id);
  const clean = settable(patch, IMMUTABLE, false);
  const required = REQUIRED[current.type];
  const next = { ...current };
  applyPatch(next, clean, required);
  checkObject(doc, next, id);
  return edit(doc, (d) => applyPatch(d.objects[id] ?? {}, clean, required))[0];
}

function checkObject(doc: Doc, obj: ObjectInit, self: ObjectId | undefined): void {
  switch (obj.type) {
    case 'arrow':
      checkPoint('arrow start', obj.from);
      checkPoint('arrow end', obj.to);
      return;
    case 'curved-arrow':
      checkAnchor(doc, 'curved-arrow start', obj.from);
      checkAnchor(doc, 'curved-arrow end', obj.to);
      checkFinite('bend', obj.bend);
      return;
    case 'plus':
      checkPoint('plus position', obj.at);
      return;
    case 'text':
      checkPoint('text position', obj.at);
      checkRuns(obj.runs);
      if (obj.attachedTo) {
        const target = doc.objects[obj.attachedTo.arrow];
        if (!target || target.type !== 'arrow' || target.id === self) {
          throw new DocError('invalid-attachment', `'${obj.attachedTo.arrow}' is not an arrow`);
        }
      }
      return;
    case 'caption':
      checkRuns(obj.runs);
      if (obj.target.length === 0) invalid('caption needs at least one target atom');
      for (const atom of obj.target) {
        if (!(atom in doc.atoms)) throw new DocError('unknown-atom', atom);
      }
      return;
    case 'callout':
      checkPoint('callout position', obj.at);
      checkRuns(obj.runs);
      checkAnchor(doc, 'callout anchor', obj.anchor);
      return;
    case 'bracket':
      checkRect(obj.rect);
      if (obj.corner) checkRuns(obj.corner);
      return;
    case 'shape':
      checkRect(obj.rect);
      checkColor('stroke', obj.stroke);
      checkColor('fill', obj.fill);
      if (!(obj.fillOpacity >= 0 && obj.fillOpacity <= 1)) invalid('fillOpacity must be in [0, 1]');
      return;
    default:
      assertNever(obj);
  }
}

function checkRuns(runs: readonly TextRun[]): void {
  for (const r of runs) checkColor('text colour', r.color);
}

function checkRect(r: Rect): void {
  checkFinite('rect', r.x, r.y, r.w, r.h);
  if (r.w < 0 || r.h < 0) invalid('rect width and height must be ≥ 0');
}
