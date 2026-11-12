import { describe, expect, it } from 'vitest';
import { OPTIONS, TOOLS } from './catalog';
import { actionTip, HISTORY_TIPS, optionTip, STATUS_TIPS, toolTip } from './tips';

describe('tool tooltips', () => {
  it('Bond: name, key and the first two hint sentences', () => {
    const bond = TOOLS.find((t) => t.id === 'bond');
    if (!bond) throw new Error('no bond tool');
    expect(toolTip(bond)).toEqual({
      title: 'Bond',
      digit: '3',
      key: 'B',
      help: 'Click to add a bond. Drag to aim it.',
    });
  });

  it('every tool has a title, its key and a help line', () => {
    for (const tool of TOOLS) {
      const tip = toolTip(tool);
      expect(tip.title).toBe(tool.label);
      expect(tip.key).toBe(tool.key);
      expect(tip.digit).toBe(tool.digit);
      expect(tip.help ?? '').not.toBe('');
    }
  });

  it('a one-sentence hint is used whole', () => {
    const chain = TOOLS.find((t) => t.id === 'chain');
    if (!chain) throw new Error('no chain tool');
    expect(toolTip(chain).help).toBe('Drag to draw a carbon chain.');
  });
});

describe('option tooltips', () => {
  it('name only for icon options', () => {
    const o = OPTIONS.ring.find((x) => x.id === 'cyclopentane');
    if (!o) throw new Error('no option');
    expect(optionTip(o)).toEqual({ title: 'Cyclopentane' });
  });

  it('elements carry the make-it help line', () => {
    const cl = OPTIONS.atom.find((x) => x.id === 'Cl');
    if (!cl) throw new Error('no option');
    expect(optionTip(cl)).toEqual({ title: 'Chlorine', help: 'Click an atom to make it Cl.' });
  });

  it('marks and delta options are name only', () => {
    for (const id of ['plus', 'delta-plus']) {
      const o = OPTIONS.atom.find((x) => x.id === id);
      if (!o) throw new Error('no option');
      expect(optionTip(o).help).toBeUndefined();
    }
  });
});

describe('action, history and status tooltips', () => {
  it('a disabled action carries its reason, an enabled one does not', () => {
    expect(
      actionTip('Flip horizontal', undefined, { enabled: false, help: 'Select a molecule first.' }),
    ).toEqual({ title: 'Flip horizontal', help: 'Select a molecule first.' });
    expect(actionTip('Clean up', 'Ctrl+Shift+L', { enabled: true, help: 'x' })).toEqual({
      title: 'Clean up',
      key: 'Ctrl+Shift+L',
    });
  });

  it('history and status controls have names and keys', () => {
    expect(HISTORY_TIPS.undo).toEqual({ title: 'Undo', key: 'Ctrl+Z' });
    expect(HISTORY_TIPS.redo).toEqual({ title: 'Redo', key: 'Ctrl+Y' });
    expect(STATUS_TIPS.zoomFit).toEqual({ title: 'Zoom to fit', key: 'Ctrl+0' });
    expect(STATUS_TIPS.zoomReset).toEqual({ title: 'Zoom to 100%' });
    expect(STATUS_TIPS.zoomOut.title).toBe('Zoom out');
    expect(STATUS_TIPS.zoomIn.title).toBe('Zoom in');
  });
});
