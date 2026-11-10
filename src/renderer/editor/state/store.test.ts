import { describe, expect, it, vi } from 'vitest';
import { createStore } from './store';

describe('store', () => {
  it('holds the initial state and applies dispatched actions', () => {
    const store = createStore();
    expect(store.getState().tool).toBe('bond');
    store.dispatch({ type: 'select-tool', tool: 'atom' });
    expect(store.getState().tool).toBe('atom');
  });

  it('notifies subscribers only when the state changed', () => {
    const store = createStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch({ type: 'select-tool', tool: 'bond' });
    expect(listener).not.toHaveBeenCalled();
    store.dispatch({ type: 'select-tool', tool: 'erase' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops notifying after unsubscribe', () => {
    const store = createStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.dispatch({ type: 'select-tool', tool: 'erase' });
    expect(listener).not.toHaveBeenCalled();
  });
});
