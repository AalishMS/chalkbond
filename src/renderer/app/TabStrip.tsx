// The tab strip (SPEC-app-shell.md T2, T3, T5, T6, T16; mock-up A18). Presentational: it renders
// the view-models it is given and reports what the user did; no flow lives here (TB20 owns them).
// It goes into the editor's `tabs` slot (editor R56); the canvas region is the `role="tabpanel"`
// that the editor builds, labelled by the active tab through `tabDomId`.
import type { KeyboardEvent, MouseEvent } from 'react';
import { tipAttrs, TooltipHost, type Tip } from './ui/Tooltip';
import './tab-strip.css';

/**
 * T6: what a tab shows before its label. `dot`: unsaved (an `untitled` tab with content, an edited
 * `picture`, a `kept` tab). `unavailable` (AS6) and `unkept` (SS6) show the warning icon in the
 * dot's place; they differ only in the help text. A file tab, also while it writes, is `none`.
 */
export type TabMarker = 'none' | 'dot' | 'unavailable' | 'unkept';

/** One tab as the strip shows it. `label` is T3's label (the model's `label(tab)`). */
export interface TabView {
  readonly id: string;
  readonly label: string;
  readonly marker: TabMarker;
}

export interface TabStripProps {
  readonly tabs: readonly TabView[];
  /** The active tab; it holds the strip's one tab stop. */
  readonly activeId: string;
  /** A click on a tab, or Enter or Space on a focused one. */
  onActivate(id: string): void;
  /** The cross, or a middle-click on a tab. */
  onClose(id: string): void;
  /** The + button. */
  onNew(): void;
}

/** The DOM id of a tab: pass `tabDomId(activeId)` as the editor's `tabPanelLabelledBy`. */
export const tabDomId = (id: string): string => `tab-${id}`;

/** T16: the accessible name is the label plus what the marker says. */
export function tabName(tab: TabView): string {
  if (tab.marker === 'dot') return `${tab.label}, not saved as a file yet`;
  if (tab.marker === 'unavailable' || tab.marker === 'unkept') return `${tab.label}, couldn't save`;
  return tab.label;
}

/** T5: the help line under the label in a tab's tooltip. */
export function tabHelp(tab: TabView): string {
  switch (tab.marker) {
    case 'dot':
      return 'Not saved as a file yet. Chalkbond keeps it for you. Press Ctrl+S to save it.';
    case 'unavailable':
      return "Couldn't save this file. Check that its folder is still there, or use Save as.";
    case 'unkept':
      return "Chalkbond couldn't keep this drawing. Free some disk space, or save it with Save as.";
    case 'none':
      return 'Switch tabs with Ctrl+Tab and Ctrl+Shift+Tab.';
  }
}

export type StripKeyAction = { focus: number } | { activate: true };

/**
 * T16: what a key does on the focused tab `index` of `count`. Arrows move focus and wrap, Home and
 * End go to the ends, Enter and Space activate (manual activation, as the rail); arrows never
 * activate. Null for any other key.
 */
export function stripKey(key: string, index: number, count: number): StripKeyAction | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight':
      return { focus: (index + 1) % count };
    case 'ArrowLeft':
      return { focus: (index - 1 + count) % count };
    case 'Home':
      return { focus: 0 };
    case 'End':
      return { focus: count - 1 };
    case 'Enter':
    case ' ':
      return { activate: true };
    default:
      return null;
  }
}

const CLOSE_TIP: Tip = { title: 'Close tab', key: 'Ctrl+W' };
const NEW_TIP: Tip = { title: 'New tab', key: 'Ctrl+T' };

export function TabStrip({
  tabs,
  activeId,
  onActivate,
  onClose,
  onNew,
}: TabStripProps): React.JSX.Element {
  // One tab stop: the active tab, or the first when the id matches none.
  const stop = tabs.some((t) => t.id === activeId) ? activeId : tabs[0]?.id;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const target = e.target;
    if (!(target instanceof HTMLElement) || target.getAttribute('role') !== 'tab') return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
    const action = stripKey(e.key, items.indexOf(target), items.length);
    if (action === null) return;
    e.preventDefault();
    if ('focus' in action) items[action.focus]?.focus();
    else {
      const id = target.dataset['tabId'];
      if (id !== undefined) onActivate(id);
    }
  };

  return (
    <div className="tabstrip" data-testid="tab-strip">
      <div className="tabs" role="tablist" aria-label="Open drawings" onKeyDown={onKeyDown}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            id={tabDomId(tab.id)}
            className="tab"
            role="tab"
            aria-selected={tab.id === activeId}
            aria-label={tabName(tab)}
            tabIndex={tab.id === stop ? 0 : -1}
            data-testid="tab"
            data-tab-id={tab.id}
            data-marker={tab.marker}
            {...tipAttrs({ title: tab.label, help: tabHelp(tab) }, 'below')}
            onClick={() => onActivate(tab.id)}
            // A middle press must not start the browser's autoscroll; the release closes the tab.
            onMouseDown={(e: MouseEvent) => {
              if (e.button === 1) e.preventDefault();
            }}
            onAuxClick={(e: MouseEvent) => {
              if (e.button !== 1) return;
              e.preventDefault();
              onClose(tab.id);
            }}
          >
            {tab.marker === 'dot' && <span className="tab-dot" aria-hidden="true" />}
            {(tab.marker === 'unavailable' || tab.marker === 'unkept') && (
              <span className="tab-warn" aria-hidden="true">
                <svg className="icon icon-16" aria-hidden="true">
                  <use href="#warning" />
                </svg>
              </span>
            )}
            <span className="tab-title">{tab.label}</span>
            <button
              type="button"
              className="tab-close"
              tabIndex={-1}
              aria-label={`Close ${tab.label} (Ctrl+W)`}
              data-testid="tab-close"
              {...tipAttrs(CLOSE_TIP, 'below')}
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
            >
              <svg className="icon icon-16" aria-hidden="true">
                <use href="#close" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn tab-add"
        aria-label="New tab (Ctrl+T)"
        data-testid="tab-add"
        {...tipAttrs(NEW_TIP, 'below')}
        onClick={onNew}
      >
        <svg className="icon icon-20" aria-hidden="true">
          <use href="#add" />
        </svg>
      </button>
      <TooltipHost />
    </div>
  );
}
