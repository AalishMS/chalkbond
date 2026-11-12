// Native menu seams for e2e (SPEC-app-shell.md TH4, TH5, R32): there is no application menu, so
// the ☰ menu is read and clicked through the stubbed `Menu.prototype.popup`: the ☰ button's click
// is dispatched (no mouse move, no focus change), the popup records its items (submenus included)
// and answers with the next choice. Playwright cannot see the native menu itself.
import { expect, type ElectronApplication } from '@playwright/test';

export interface MenuItemData {
  id: string;
  label: string;
  enabled: boolean;
  checked: boolean;
  accelerator: string | null;
  registerAccelerator: boolean;
  role: string | null;
  type: string;
}

const flatten = (items: readonly PopupItem[]): PopupItem[] =>
  items.flatMap((item) => [item, ...flatten(item.submenu ?? [])]);

/**
 * Opens the ☰ menu once (dismissed) and returns every item, depth first (menus, separators and
 * submenus included). The button must be enabled: while a dialog is open it opens nothing and this
 * times out.
 */
export async function menuItems(app: ElectronApplication): Promise<MenuItemData[]> {
  const page = await app.firstWindow();
  await stubPopup(app, [null]);
  await page.getByTestId('app-menu').dispatchEvent('click');
  await expect.poll(async () => (await popups(app)).length, { message: 'the ☰ popup' }).toBe(1);
  const [tree] = await popups(app);
  return flatten(tree ?? []).map((i) => ({
    id: i.id,
    label: i.label,
    enabled: i.enabled,
    checked: i.checked,
    accelerator: i.accelerator,
    registerAccelerator: i.registerAccelerator,
    role: i.role,
    type: i.type,
  }));
}

export async function menuItem(app: ElectronApplication, id: string): Promise<MenuItemData> {
  const item = (await menuItems(app)).find((i) => i.id === id);
  if (!item) throw new Error(`no menu item ${id}`);
  return item;
}

/**
 * Waits until the item is enabled in the ☰ popup built from the page's state now, then chooses
 * it: main ignores a click on an item built disabled (R19), as a real menu would.
 */
export async function clickEnabled(app: ElectronApplication, id: string): Promise<void> {
  await expect.poll(async () => (await menuItem(app, id)).enabled, { message: id }).toBe(true);
  await clickMenu(app, id);
}

/**
 * Opens the ☰ menu and chooses the item by id (`MenuItem.click()`, TH4); the click happens on the
 * next turn, before the close callback. The command runs asynchronously: poll its effect.
 */
export async function clickMenu(app: ElectronApplication, id: string): Promise<void> {
  const page = await app.firstWindow();
  await stubPopup(app, [id]);
  await page.getByTestId('app-menu').dispatchEvent('click');
  await expect
    .poll(async () => (await popups(app)).length, { message: `the ☰ popup for ${id}` })
    .toBe(1);
  const found = flatten((await popups(app))[0] ?? []).some((i) => i.id === id);
  if (!found) throw new Error(`no menu item ${id}`);
}

// A13 (TH4, TH5): the ☰ (I9), canvas (I6) and tab (I10) menus are popped up through
// `Menu.prototype.popup`, stubbed here.
export type PopupItem = {
  id: string;
  label: string;
  type: string;
  role: string | null;
  enabled: boolean;
  accelerator: string | null;
  registerAccelerator: boolean;
  checked: boolean;
  /** Present on a submenu holder (the ☰ popup's File, Edit, View, Help and Open recent). */
  submenu?: PopupItem[];
};

/**
 * Replaces `Menu.prototype.popup`: each popup records its items (submenus nested) and takes the
 * next choice (a menu item id anywhere in the tree, or null for a dismissed menu), clicked on the
 * next turn before the close callback.
 */
export async function stubPopup(app: ElectronApplication, choices: (string | null)[]) {
  await app.evaluate(({ Menu }, list) => {
    const g = globalThis as { __popups?: unknown[][]; __popupAt?: unknown[] };
    g.__popups = [];
    g.__popupAt = [];
    const answers = [...list];
    const record = (items: readonly Electron.MenuItem[]): unknown[] =>
      items.map((i) => ({
        id: i.id ?? '',
        label: i.label,
        type: i.type,
        role: i.role ?? null,
        enabled: i.enabled,
        accelerator: i.accelerator ?? null,
        registerAccelerator: i.registerAccelerator,
        checked: i.checked,
        ...(i.submenu ? { submenu: record(i.submenu.items) } : {}),
      }));
    Menu.prototype.popup = function popup(this: Electron.Menu, options?: Electron.PopupOptions) {
      g.__popups?.push(record(this.items));
      g.__popupAt?.push({ x: options?.x ?? null, y: options?.y ?? null });
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

/** Where each popup was asked to appear (content px; null: at the cursor). */
export const popupPoints = (
  app: ElectronApplication,
): Promise<{ x: number | null; y: number | null }[]> =>
  app.evaluate(() => ((globalThis as { __popupAt?: unknown[] }).__popupAt ?? []) as never);
