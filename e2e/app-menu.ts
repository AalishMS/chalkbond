// Native application menu seams for e2e (SPEC-app-shell.md TH4, TH5): items are read and clicked
// by id through `Menu.getApplicationMenu()`; Playwright cannot see the native menu itself.
import { expect, type ElectronApplication } from '@playwright/test';

export interface MenuItemData {
  id: string;
  label: string;
  enabled: boolean;
  checked: boolean;
  accelerator: string | null;
  registerAccelerator: boolean;
  role: string | null;
}

/** Every item of the application menu, depth first (menus, separators and submenus included). */
export async function menuItems(app: ElectronApplication): Promise<MenuItemData[]> {
  return app.evaluate(({ Menu }) => {
    const out: {
      id: string;
      label: string;
      enabled: boolean;
      checked: boolean;
      accelerator: string | null;
      registerAccelerator: boolean;
      role: string | null;
    }[] = [];
    const walk = (menu: Electron.Menu | null | undefined): void => {
      for (const item of menu?.items ?? []) {
        out.push({
          id: item.id ?? '',
          label: item.label,
          enabled: item.enabled,
          checked: item.checked,
          accelerator: item.accelerator ?? null,
          registerAccelerator: item.registerAccelerator,
          role: item.role ?? null,
        });
        walk(item.submenu);
      }
    };
    walk(Menu.getApplicationMenu());
    return out;
  });
}

export async function menuItem(app: ElectronApplication, id: string): Promise<MenuItemData> {
  const item = (await menuItems(app)).find((i) => i.id === id);
  if (!item) throw new Error(`no menu item ${id}`);
  return item;
}

/**
 * Waits until the item is enabled in the rebuilt menu (N1 follows the page within a frame), then
 * clicks it: main ignores a click on an item built disabled (R19), as a real menu would.
 */
export async function clickEnabled(app: ElectronApplication, id: string): Promise<void> {
  await expect.poll(async () => (await menuItem(app, id)).enabled, { message: id }).toBe(true);
  await clickMenu(app, id);
}

/** Clicks an application menu item as the user would (`MenuItem.click()`, TH4). */
export async function clickMenu(app: ElectronApplication, id: string): Promise<void> {
  const found = await app.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);
    if (!item) return false;
    item.click();
    return true;
  }, id);
  if (!found) throw new Error(`no menu item ${id}`);
}

// A13 (TH4, TH5): context menus are popped up through `Menu.prototype.popup`, stubbed here.
export type PopupItem = {
  id: string;
  label: string;
  type: string;
  role: string | null;
  enabled: boolean;
  accelerator: string | null;
  registerAccelerator: boolean;
};

/**
 * Replaces `Menu.prototype.popup`: each popup records its items and takes the next choice (a menu
 * item id, or null for a dismissed menu), clicked on the next turn before the close callback.
 */
export async function stubPopup(app: ElectronApplication, choices: (string | null)[]) {
  await app.evaluate(({ Menu }, list) => {
    const g = globalThis as { __popups?: unknown[][] };
    g.__popups = [];
    const answers = [...list];
    Menu.prototype.popup = function popup(this: Electron.Menu, options?: Electron.PopupOptions) {
      g.__popups?.push(
        this.items.map((i) => ({
          id: i.id ?? '',
          label: i.label,
          type: i.type,
          role: i.role ?? null,
          enabled: i.enabled,
          accelerator: i.accelerator ?? null,
          registerAccelerator: i.registerAccelerator,
        })),
      );
      const choice = answers.shift() ?? null;
      setImmediate(() => {
        if (choice !== null) this.getMenuItemById(choice)?.click();
        options?.callback?.();
      });
    };
  }, choices);
}

export const popups = (app: ElectronApplication): Promise<PopupItem[][]> =>
  app.evaluate(() => ((globalThis as { __popups?: unknown[][] }).__popups ?? []) as never);
