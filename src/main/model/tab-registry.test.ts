// The tab registry: tab id -> binding (I12, T17, AS9), SS5's hash steps and AS5's decision
// (SPEC-app-shell.md "Tabs, auto-save and session").
import { describe, expect, it } from 'vitest';
import type { SessionIndex } from './session-index';
import {
  acceptOutside,
  bindTab,
  checkOutcome,
  emptyRegistry,
  failWrite,
  finishWrite,
  mainFieldsOf,
  openIn,
  openTabsOf,
  pathKeyOf,
  registryFromIndex,
  startWrite,
  withBinding,
  withoutTabs,
  type BindRequest,
  type TabBinding,
  type TabRegistry,
} from './tab-registry';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';
const hash = (c: string): string => c.repeat(64);
const winKey = pathKeyOf(true);
const ESTER = 'C:\\Lessons\\Esterification.chalk';
const ETHANOL = 'C:\\Lessons\\ethanol.png';

const open = (ids: string[]): ReadonlySet<string> => new Set(ids);

/** Binds or fails the test. */
function bound(registry: TabRegistry, request: BindRequest, tabs: string[]): TabRegistry {
  const result = bindTab(registry, request, open(tabs), winKey);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result.registry;
}

const openChalk = (tabId: string, path = ESTER): BindRequest => ({
  reason: 'open',
  tabId,
  path,
  kind: 'chalk',
  fileHash: hash('a'),
  written: hash('b'),
});

describe('path keys', () => {
  it('Windows compares paths without case; elsewhere exactly', () => {
    expect(pathKeyOf(true)('C:\\A\\Ethanol.CHALK')).toBe('c:\\a\\ethanol.chalk');
    expect(pathKeyOf(false)('/home/a/Ethanol.chalk')).toBe('/home/a/Ethanol.chalk');
  });
});

describe('I12 transitions', () => {
  it('open binds a chalk file with both hashes and the key of its path', () => {
    const registry = bound(emptyRegistry(), openChalk(A), [A]);
    expect(registry.get(A)).toEqual({
      kind: 'chalk',
      path: ESTER,
      pathKey: 'c:\\lessons\\esterification.chalk',
      fileHash: hash('a'),
      written: hash('b'),
      writing: null,
    });
  });

  it('open binds a picture to its picture, without hashes (A6: never written)', () => {
    const registry = bound(
      emptyRegistry(),
      {
        reason: 'open',
        tabId: C,
        path: ETHANOL,
        kind: 'picture',
        fileHash: hash('a'),
        written: null,
      },
      [C],
    );
    expect(registry.get(C)).toEqual({
      kind: 'picture',
      path: ETHANOL,
      pathKey: 'c:\\lessons\\ethanol.png',
      fileHash: null,
      written: null,
      writing: null,
    });
  });

  it('open of a path bound to another open tab answers that tab (T17), any case', () => {
    const registry = bound(emptyRegistry(), openChalk(A), [A, B]);
    const result = bindTab(
      registry,
      openChalk(B, 'c:\\LESSONS\\esterification.chalk'),
      open([A, B]),
      winKey,
    );
    expect(result).toEqual({ ok: false, openIn: A });
  });

  it('a picture tab owns its picture (T17)', () => {
    const registry = bound(
      emptyRegistry(),
      {
        reason: 'open',
        tabId: C,
        path: ETHANOL,
        kind: 'picture',
        fileHash: hash('a'),
        written: null,
      },
      [C, B],
    );
    const again: BindRequest = {
      reason: 'open',
      tabId: B,
      path: 'C:\\LESSONS\\Ethanol.png',
      kind: 'picture',
      fileHash: hash('a'),
      written: null,
    };
    expect(bindTab(registry, again, open([C, B]), winKey)).toEqual({ ok: false, openIn: C });
  });

  it('a closed tab does not own its path any more (its binding waits for reopen)', () => {
    const registry = bound(emptyRegistry(), openChalk(A), [A]);
    const reg2 = bound(registry, openChalk(B), [B]);
    expect(reg2.get(A)?.path).toBe(ESTER);
    expect(reg2.get(B)?.path).toBe(ESTER);
  });

  it('open again into the same tab rebinds it', () => {
    const registry = bound(emptyRegistry(), openChalk(A), [A]);
    const again = bound(registry, { ...openChalk(A), fileHash: hash('c') } as BindRequest, [A]);
    expect(again.get(A)?.fileHash).toBe(hash('c'));
  });

  it('save-as binds the new file; the old path is free', () => {
    const registry = bound(emptyRegistry(), openChalk(A), [A, B]);
    const saved = bound(
      registry,
      {
        reason: 'save-as',
        tabId: A,
        path: 'D:\\Copy.chalk',
        fileHash: hash('c'),
        written: hash('c'),
      },
      [A, B],
    );
    expect(saved.get(A)).toEqual({
      kind: 'chalk',
      path: 'D:\\Copy.chalk',
      pathKey: 'd:\\copy.chalk',
      fileHash: hash('c'),
      written: hash('c'),
      writing: null,
    });
    expect(openIn(saved, winKey(ESTER), open([A, B]))).toBeNull();
  });

  it('save-as of a picture tab turns it into a file tab', () => {
    const registry = bound(
      emptyRegistry(),
      {
        reason: 'open',
        tabId: C,
        path: ETHANOL,
        kind: 'picture',
        fileHash: hash('a'),
        written: null,
      },
      [C],
    );
    const saved = bound(
      registry,
      { reason: 'save-as', tabId: C, path: ESTER, fileHash: hash('d'), written: hash('d') },
      [C],
    );
    expect(saved.get(C)?.kind).toBe('chalk');
  });

  it('save-as onto a path bound to another tab is refused and changes nothing (AS9)', () => {
    let registry = bound(emptyRegistry(), openChalk(A), [A, B]);
    registry = bound(registry, openChalk(B, 'C:\\Lessons\\other.chalk'), [A, B]);
    const request: BindRequest = {
      reason: 'save-as',
      tabId: B,
      path: 'c:\\lessons\\ESTERIFICATION.chalk',
      fileHash: hash('c'),
      written: hash('c'),
    };
    expect(bindTab(registry, request, open([A, B]), winKey)).toEqual({ ok: false, openIn: A });
    expect(registry.get(B)?.path).toBe('C:\\Lessons\\other.chalk');
  });

  it('save-as onto its own path is allowed', () => {
    const registry = bound(emptyRegistry(), openChalk(A), [A]);
    const saved = bound(
      registry,
      { reason: 'save-as', tabId: A, path: ESTER, fileHash: hash('e'), written: hash('e') },
      [A],
    );
    expect(saved.get(A)?.written).toBe(hash('e'));
  });

  it('unbind keeps the former file (for F6 folder) but no hashes; the path is free', () => {
    const registry = startWrite(bound(emptyRegistry(), openChalk(A), [A, B]), A, hash('c'));
    const unbound = bound(registry, { reason: 'unbind', tabId: A }, [A, B]);
    expect(unbound.get(A)).toEqual({
      kind: 'former',
      path: ESTER,
      pathKey: 'c:\\lessons\\esterification.chalk',
      fileHash: null,
      written: null,
      writing: null,
    });
    expect(openIn(unbound, winKey(ESTER), open([A, B]))).toBeNull();
    expect(bindTab(unbound, openChalk(B), open([A, B]), winKey).ok).toBe(true);
  });

  it('unbind of a tab without a binding changes nothing', () => {
    const registry = bound(emptyRegistry(), openChalk(A), [A]);
    expect(bound(registry, { reason: 'unbind', tabId: B }, [A, B])).toEqual(registry);
  });

  describe('reopen (T12): the binding of the closed tab moves to the fresh id', () => {
    it('keeps path and hashes; the old id is unbound', () => {
      const registry = finishWrite(bound(emptyRegistry(), openChalk(A), [A]), A, hash('c'));
      const reopened = bound(registry, { reason: 'reopen', tabId: D, from: A }, [D]);
      expect(reopened.get(D)).toEqual(registry.get(A));
      expect(reopened.has(A)).toBe(false);
    });

    it('moves a picture and a former binding too', () => {
      let registry = bound(
        emptyRegistry(),
        {
          reason: 'open',
          tabId: C,
          path: ETHANOL,
          kind: 'picture',
          fileHash: hash('a'),
          written: null,
        },
        [C],
      );
      registry = bound(registry, openChalk(A), [A]);
      registry = bound(registry, { reason: 'unbind', tabId: A }, [A]);
      registry = bound(registry, { reason: 'reopen', tabId: D, from: C }, [D]);
      registry = bound(registry, { reason: 'reopen', tabId: B, from: A }, [D, B]);
      expect(registry.get(D)?.kind).toBe('picture');
      expect(registry.get(B)?.kind).toBe('former');
    });

    it('is refused when another tab opened the file meanwhile', () => {
      let registry = bound(emptyRegistry(), openChalk(A), [A]);
      registry = bound(registry, openChalk(B), [B]);
      const result = bindTab(
        registry,
        { reason: 'reopen', tabId: D, from: A },
        open([B, D]),
        winKey,
      );
      expect(result).toEqual({ ok: false, openIn: B });
    });

    it('an unknown closed tab is not bound', () => {
      const result = bindTab(
        emptyRegistry(),
        { reason: 'reopen', tabId: D, from: A },
        open([D]),
        winKey,
      );
      expect(result).toEqual({ ok: false, notBound: A });
    });
  });

  describe('take-over (AS7(c)): the new file tab takes path and file hash from her tab', () => {
    it('moves path and file hash; her tab keeps only the former file', () => {
      const registry = bound(emptyRegistry(), openChalk(A), [A, B]);
      const taken = bound(
        registry,
        { reason: 'take-over', tabId: B, from: A, written: hash('d') },
        [A, B],
      );
      expect(taken.get(B)).toEqual({
        kind: 'chalk',
        path: ESTER,
        pathKey: 'c:\\lessons\\esterification.chalk',
        fileHash: hash('a'),
        written: hash('d'),
        writing: null,
      });
      expect(taken.get(A)).toEqual({
        ...registry.get(A),
        kind: 'former',
        fileHash: null,
        written: null,
      });
      expect(openIn(taken, winKey(ESTER), open([A, B]))).toBe(B);
    });

    it('takes the hash of the bytes read when given (so the next check is same)', () => {
      const registry = bound(emptyRegistry(), openChalk(A), [A, B]);
      const taken = bound(
        registry,
        { reason: 'take-over', tabId: B, from: A, fileHash: hash('e'), written: hash('e') },
        [A, B],
      );
      expect(taken.get(B)?.fileHash).toBe(hash('e'));
    });

    it('from a tab that is not a file tab is not bound', () => {
      const registry = bound(
        emptyRegistry(),
        {
          reason: 'open',
          tabId: C,
          path: ETHANOL,
          kind: 'picture',
          fileHash: hash('a'),
          written: null,
        },
        [C, B],
      );
      const request: BindRequest = { reason: 'take-over', tabId: B, from: C, written: null };
      expect(bindTab(registry, request, open([C, B]), winKey)).toEqual({ ok: false, notBound: C });
      expect(bindTab(emptyRegistry(), request, open([B]), winKey)).toEqual({
        ok: false,
        notBound: C,
      });
    });

    it('is refused when a third tab owns the path', () => {
      let registry = bound(emptyRegistry(), openChalk(A), [A]);
      registry = bound(registry, openChalk(C), [C]);
      const result = bindTab(
        registry,
        { reason: 'take-over', tabId: B, from: A, written: null },
        open([A, B, C]),
        winKey,
      );
      expect(result).toEqual({ ok: false, openIn: C });
    });
  });

  it('every transition leaves the previous registry untouched', () => {
    const registry = bound(emptyRegistry(), openChalk(A), [A]);
    const before = new Map(registry);
    bound(registry, { reason: 'unbind', tabId: A }, [A]);
    bound(registry, { reason: 'reopen', tabId: D, from: A }, [D]);
    startWrite(registry, A, hash('c'));
    finishWrite(registry, A, hash('c'));
    failWrite(registry, A);
    acceptOutside(registry, A, hash('c'), hash('d'));
    withoutTabs(registry, [A]);
    expect(registry).toEqual(before);
  });
});

describe('openIn', () => {
  it('answers the open owner tab through the injected key, or null', () => {
    const registry = bound(emptyRegistry(), openChalk(A), [A, B]);
    expect(openIn(registry, winKey('c:/x/../LESSONS'), open([A, B]))).toBeNull();
    expect(openIn(registry, winKey('C:\\LESSONS\\ESTERIFICATION.CHALK'), open([A, B]))).toBe(A);
    expect(openIn(registry, winKey(ESTER), open([A, B]), [A])).toBeNull();
    expect(openIn(registry, winKey(ESTER), open([B]))).toBeNull();
  });

  it('on a case-sensitive key two spellings are two files', () => {
    const exact = pathKeyOf(false);
    const result = bindTab(emptyRegistry(), openChalk(A, '/home/t/A.chalk'), open([A, B]), exact);
    if (!result.ok) throw new Error('expected ok');
    expect(openIn(result.registry, exact('/home/t/a.chalk'), open([A, B]))).toBeNull();
    expect(openIn(result.registry, exact('/home/t/A.chalk'), open([A, B]))).toBe(A);
  });
});

describe('SS5 hash steps', () => {
  const registry = bound(emptyRegistry(), openChalk(A), [A]);

  it('writing is set before a write', () => {
    expect(startWrite(registry, A, hash('c')).get(A)).toMatchObject({
      fileHash: hash('a'),
      written: hash('b'),
      writing: hash('c'),
    });
  });

  it('success promotes it to the file hash and the written hash', () => {
    const done = finishWrite(startWrite(registry, A, hash('c')), A, hash('c'));
    expect(done.get(A)).toMatchObject({ fileHash: hash('c'), written: hash('c'), writing: null });
  });

  it('a failed or refused write clears it at once', () => {
    const failed = failWrite(startWrite(registry, A, hash('c')), A);
    expect(failed.get(A)).toMatchObject({ fileHash: hash('a'), written: hash('b'), writing: null });
  });

  it('N9: the bytes read become the file hash and the renderer hash the written hash', () => {
    const accepted = acceptOutside(startWrite(registry, A, hash('c')), A, hash('e'), hash('f'));
    expect(accepted.get(A)).toMatchObject({
      fileHash: hash('e'),
      written: hash('f'),
      writing: null,
    });
  });

  it('steps on a tab that is not a file tab change nothing', () => {
    const picture = bound(
      emptyRegistry(),
      {
        reason: 'open',
        tabId: C,
        path: ETHANOL,
        kind: 'picture',
        fileHash: hash('a'),
        written: null,
      },
      [C],
    );
    expect(startWrite(picture, C, hash('c'))).toBe(picture);
    expect(finishWrite(picture, C, hash('c'))).toBe(picture);
    expect(failWrite(picture, D)).toBe(picture);
    expect(acceptOutside(picture, C, hash('c'), hash('c'))).toBe(picture);
  });
});

describe('AS5: checkOutcome', () => {
  const entry: TabBinding = {
    kind: 'chalk',
    path: ESTER,
    pathKey: winKey(ESTER),
    fileHash: hash('a'),
    written: hash('b'),
    writing: null,
  };

  it('equal to the file hash is same, nothing changes', () => {
    expect(checkOutcome(entry, { ok: true, bytesHash: hash('a') })).toEqual({
      outcome: 'same',
      entry,
    });
  });

  it('equal to the file hash with a write in flight is same and keeps the in-flight hash', () => {
    const inFlight = { ...entry, writing: hash('c') };
    expect(checkOutcome(inFlight, { ok: true, bytesHash: hash('a') })).toEqual({
      outcome: 'same',
      entry: inFlight,
    });
  });

  it('equal to the write in flight is same and promoted (power cut between file and index)', () => {
    const inFlight = { ...entry, writing: hash('c') };
    expect(checkOutcome(inFlight, { ok: true, bytesHash: hash('c') })).toEqual({
      outcome: 'same',
      entry: { ...entry, fileHash: hash('c'), written: hash('c'), writing: null },
    });
  });

  it('different bytes are changed, with their hash; nothing changes', () => {
    expect(checkOutcome(entry, { ok: true, bytesHash: hash('d') })).toEqual({
      outcome: 'changed',
      entry,
      bytesHash: hash('d'),
    });
  });

  it('the written hash alone is not ours on disk (it is the drawing, not the bytes)', () => {
    expect(checkOutcome(entry, { ok: true, bytesHash: hash('b') }).outcome).toBe('changed');
  });

  it('ENOENT is missing and a read error unreadable; nothing changes', () => {
    expect(checkOutcome(entry, { ok: false, problem: 'missing' })).toEqual({
      outcome: 'missing',
      entry,
    });
    expect(checkOutcome(entry, { ok: false, problem: 'unreadable' })).toEqual({
      outcome: 'unreadable',
      entry,
    });
  });

  it('a binding without a file hash (a picture, a former file) is never same', () => {
    const picture: TabBinding = { ...entry, kind: 'picture', fileHash: null, written: null };
    expect(checkOutcome(picture, { ok: true, bytesHash: hash('a') }).outcome).toBe('changed');
    const former: TabBinding = { ...entry, kind: 'former', fileHash: hash('a') };
    expect(checkOutcome(former, { ok: true, bytesHash: hash('a') }).outcome).toBe('changed');
  });
});

describe('the index and the registry', () => {
  const index: SessionIndex = {
    version: 1,
    tabs: [
      {
        id: A,
        kind: 'chalk',
        name: 'Esterification',
        path: ESTER,
        fileHash: hash('a'),
        written: hash('b'),
        writing: hash('c'),
        unsaved: false,
        warning: false,
        view: null,
      },
      {
        id: B,
        kind: 'untitled',
        name: 'Untitled',
        path: null,
        fileHash: null,
        written: null,
        writing: null,
        unsaved: true,
        warning: false,
        view: null,
      },
      {
        id: C,
        kind: 'picture',
        name: 'ethanol.png',
        path: ETHANOL,
        fileHash: null,
        written: null,
        writing: null,
        unsaved: false,
        warning: false,
        view: null,
      },
      {
        id: D,
        kind: 'kept',
        name: 'Esterification (your changes)',
        path: 'C:\\Old\\esterification.chalk',
        fileHash: null,
        written: null,
        writing: null,
        unsaved: true,
        warning: false,
        view: null,
      },
    ],
    active: A,
    discarded: [],
  };

  it('a restart rebuilds the bindings from the index (paths, hashes, the write in flight)', () => {
    const registry = registryFromIndex(index, winKey);
    expect([...registry.keys()]).toEqual([A, C, D]);
    expect(registry.get(A)).toEqual({
      kind: 'chalk',
      path: ESTER,
      pathKey: winKey(ESTER),
      fileHash: hash('a'),
      written: hash('b'),
      writing: hash('c'),
    });
    expect(registry.get(C)?.kind).toBe('picture');
    expect(registry.get(D)?.kind).toBe('former');
    expect(
      openIn(registry, winKey('c:\\old\\esterification.chalk'), open([A, B, C, D])),
    ).toBeNull();
  });

  it('a kept tab without a former path has no binding', () => {
    const kept = { ...index, tabs: [{ ...index.tabs[3]!, path: null }] };
    expect(registryFromIndex(kept, winKey).size).toBe(0);
  });

  it('mainFieldsOf answers the fields the index stores for a tab', () => {
    const registry = registryFromIndex(index, winKey);
    expect(mainFieldsOf(registry, A)).toEqual({
      path: ESTER,
      fileHash: hash('a'),
      written: hash('b'),
      writing: hash('c'),
    });
    expect(mainFieldsOf(registry, D)).toEqual({
      path: 'C:\\Old\\esterification.chalk',
      fileHash: null,
      written: null,
      writing: null,
    });
    expect(mainFieldsOf(registry, B)).toEqual({
      path: null,
      fileHash: null,
      written: null,
      writing: null,
    });
  });

  it('withoutTabs drops the bindings of deleted tabs', () => {
    const registry = registryFromIndex(index, winKey);
    expect([...withoutTabs(registry, [A, B]).keys()]).toEqual([C, D]);
  });
});

describe('TB10: open tabs and the Save-as rollback', () => {
  const saveAs = (tabId: string): BindRequest => ({
    reason: 'save-as',
    tabId,
    path: 'D:\\New.chalk',
    fileHash: hash('d'),
    written: hash('d'),
  });

  it('openTabsOf counts listed and bound tabs, never a closed (discarded) one', () => {
    const registry = bound(bound(emptyRegistry(), openChalk(A), [A]), openChalk(B, ETHANOL), [B]);
    expect([...openTabsOf(registry, [C, A], [B])].sort()).toEqual([A, C]);
    expect([...openTabsOf(registry, [], [])].sort()).toEqual([A, B]);
    expect([...openTabsOf(emptyRegistry(), [D], [D])]).toEqual([]);
  });

  it('withBinding puts a previous binding back, or removes the tab when it had none', () => {
    const before = bound(emptyRegistry(), openChalk(A), [A]);
    const previous = before.get(A);
    const after = bound(before, saveAs(A), [A]);
    expect(after.get(A)?.path).toBe('D:\\New.chalk');
    expect(withBinding(after, A, previous).get(A)).toEqual(previous);
    const fresh = bound(emptyRegistry(), saveAs(B), [B]);
    expect(withBinding(fresh, B, undefined).has(B)).toBe(false);
    expect(fresh.has(B)).toBe(true);
  });
});
