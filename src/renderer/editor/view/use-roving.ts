import { useState } from 'react';

type Axis = 'horizontal' | 'vertical';

interface RovingItem {
  tabIndex: number;
  'data-roving': string;
  onFocus: () => void;
}

export interface Roving {
  /** Props for the button `id`: the current one is the toolbar's only tab stop. */
  item: (id: string) => RovingItem;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
}

const KEYS: Record<Axis, { prev: string; next: string }> = {
  horizontal: { prev: 'ArrowLeft', next: 'ArrowRight' },
  vertical: { prev: 'ArrowUp', next: 'ArrowDown' },
};

/**
 * Roving tabindex for a toolbar (K4): one tab stop, arrow keys move focus (wrapping), Home and
 * End jump. The tab stop is `defaultId` until a button is focused; it returns to `defaultId`
 * whenever `resetKey` changes (the selection or the tool changed).
 */
export function useRoving(axis: Axis, defaultId: string, resetKey: string): Roving {
  const [focused, setFocused] = useState<{ key: string; id: string } | null>(null);
  const current = focused?.key === resetKey ? focused.id : defaultId;
  return {
    item: (id) => ({
      tabIndex: id === current ? 0 : -1,
      'data-roving': id,
      onFocus: () => {
        setFocused({ key: resetKey, id });
      },
    }),
    onKeyDown: (e) => {
      const { prev, next } = KEYS[axis];
      if (e.key !== prev && e.key !== next && e.key !== 'Home' && e.key !== 'End') return;
      const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-roving]')];
      const from = items.indexOf(
        e.target instanceof Element
          ? (e.target.closest<HTMLElement>('[data-roving]') ?? document.body)
          : document.body,
      );
      if (from < 0) return;
      const to =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? items.length - 1
            : (from + (e.key === next ? 1 : -1) + items.length) % items.length;
      e.preventDefault();
      items[to]?.focus();
    },
  };
}
