// The ☰ button (SPEC-app-shell.md M4, R32; mock-up A19): the first child of the editor's top bar,
// before the name field. It only asks the host to open the native popup (I9) and shows whether the
// popup is open (`aria-expanded`) and whether a dialog forbids it (V3: `aria-disabled`, still
// focusable). A mouse press does not take focus (editor K5), so a focused name field keeps it and
// the Edit items act on its text (M3); Enter and Space reach the same `click`.
import { useSyncExternalStore } from 'react';
import { tipAttrs, type Tip } from './ui/Tooltip';
import './menu-button.css';

/** A19 is normative for the title; the help line names the four menus. */
export const MENU_TIP: Tip = { title: 'Menu (Alt or F10)', help: 'File, Edit, View and Help.' };

export interface MenuButtonProps {
  /** `aria-expanded`: the popup is open. */
  open: boolean;
  /** An in-window dialog is open (V3): the press does nothing. */
  disabled: boolean;
  onPress(): void;
}

/** Markup and behaviour of the button; no host. */
export function MenuButtonView({ open, disabled, onPress }: MenuButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className="btn btn-top btn-menu"
      data-testid="app-menu"
      aria-label="Menu"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-disabled={disabled ? true : undefined}
      {...tipAttrs(MENU_TIP, 'below')}
      onMouseDown={(e) => e.preventDefault()}
      onClick={disabled ? undefined : onPress}
    >
      <svg className="icon icon-20" aria-hidden="true">
        <use href="#menu" />
      </svg>
    </button>
  );
}

/** What the host tells the button (`host.appMenu`, `host.modal`). */
export interface MenuButtonHost {
  appMenu: {
    open(): Promise<void>;
    isOpen(): boolean;
    subscribe(listener: () => void): () => void;
  };
  modal(): boolean;
}

/** The ☰ button for the host's popup; it re-renders itself, not the editor. */
export function MenuButton({ host }: { host: MenuButtonHost }): React.JSX.Element {
  const open = useSyncExternalStore(
    host.appMenu.subscribe,
    host.appMenu.isOpen,
    host.appMenu.isOpen,
  );
  const disabled = useSyncExternalStore(host.appMenu.subscribe, host.modal, host.modal);
  return (
    <MenuButtonView
      open={open}
      disabled={disabled}
      onPress={() => {
        void host.appMenu.open();
      }}
    />
  );
}
