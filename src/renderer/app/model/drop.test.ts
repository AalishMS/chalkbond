// F12 drag and drop (SPEC-app-shell.md F12, R22; "Drop overlay"): which drags count, which file is
// opened, and when the overlay shows. DOM-free.
import { describe, expect, it } from 'vitest';
import { createDropTracker, hasFiles, pickDropped } from './drop';

const f = (name: string) => ({ name });

describe('hasFiles', () => {
  it("only a drag carrying Files counts; text drags are the editor's", () => {
    expect(hasFiles(['Files'])).toBe(true);
    expect(hasFiles(['text/plain', 'Files'])).toBe(true);
    expect(hasFiles(['text/plain', 'text/html'])).toBe(false);
    expect(hasFiles([])).toBe(false);
  });
});

describe('pickDropped', () => {
  it('the first file with an Open extension (any case, .pdf under PDF-A)', () => {
    expect(pickDropped([f('notes.docx'), f('b.SVG'), f('c.chalk')])).toEqual(f('b.SVG'));
    expect(pickDropped([f('x.txt'), f('report.pdf')])).toEqual(f('report.pdf'));
    expect(pickDropped([f('a.png')])).toEqual(f('a.png'));
  });

  it('none: the first file (main answers unsupported with its name); no files: null', () => {
    expect(pickDropped([f('notes.docx'), f('x.chalk.txt')])).toEqual(f('notes.docx'));
    expect(pickDropped([])).toBeNull();
  });
});

describe('createDropTracker', () => {
  it('a Files drag shows the overlay until the last dragleave of the window', () => {
    const t = createDropTracker();
    const heard: boolean[] = [];
    t.subscribe(() => heard.push(t.visible()));
    t.enter(['Files'], false);
    t.enter(['Files'], false); // into a child element
    t.leave(['Files']);
    expect(t.visible()).toBe(true);
    t.leave(['Files']);
    expect(t.visible()).toBe(false);
    t.leave(['Files']); // an extra leave never goes negative
    t.enter(['Files'], false);
    expect(t.visible()).toBe(true);
    expect(heard).toEqual([true, false, true]);
  });

  it('drop and Esc hide it at once', () => {
    const t = createDropTracker();
    t.enter(['Files'], false);
    t.enter(['Files'], false);
    t.drop();
    expect(t.visible()).toBe(false);
    t.enter(['Files'], false);
    t.escape();
    expect(t.visible()).toBe(false);
    t.enter(['Files'], false);
    expect(t.visible()).toBe(true);
  });

  it('text drags never show it; a drag that starts while a dialog is open shows nothing', () => {
    const t = createDropTracker();
    t.enter(['text/plain'], false);
    expect(t.visible()).toBe(false);
    t.enter(['Files'], true);
    expect(t.visible()).toBe(false);
    t.leave(['Files']);
    t.enter(['Files'], false);
    expect(t.visible()).toBe(true);
  });

  it('a dialog opening during the drag hides the overlay at the next dragenter', () => {
    const t = createDropTracker();
    t.enter(['Files'], false);
    t.enter(['Files'], true);
    expect(t.visible()).toBe(false);
  });

  it('unsubscribe stops notifications', () => {
    const t = createDropTracker();
    let n = 0;
    const stop = t.subscribe(() => n++);
    t.enter(['Files'], false);
    stop();
    t.drop();
    expect(n).toBe(1);
  });
});
