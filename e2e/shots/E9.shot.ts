import { test } from '@playwright/test';
import { openApp, resizeContent, shot } from '../harness';

test('E9 tooltips, focus rings and control states', async () => {
  const { app, page } = await openApp();
  try {
    await page.getByTestId('canvas').waitFor();
    const tip = page.getByRole('tooltip');
    const reset = async (): Promise<void> => {
      await page.mouse.move(700, 600);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(450);
    };

    // Launch: the canvas has focus (no ring until the keyboard is used).
    await shot(page, 'E9', 'launch');

    // Tooltips.
    await page.getByTestId('tool-bond').hover();
    await tip.waitFor();
    await shot(page, 'E9', 'tooltip-bond');
    await reset();

    await page.getByTestId('tool-ring').click();
    await page.getByTestId('opt-cyclopentane').hover();
    await tip.waitFor();
    await shot(page, 'E9', 'tooltip-option');
    await reset();

    await page.getByTestId('tool-atom').click();
    await page.getByTestId('opt-Cl').hover();
    await tip.waitFor();
    await shot(page, 'E9', 'tooltip-option-help');
    await reset();

    await page.getByTestId('tool-select').click();
    await page.getByTestId('act-flip-h').hover();
    await tip.waitFor();
    await shot(page, 'E9', 'tooltip-disabled-flip');
    await reset();

    await page.getByTestId('undo').hover();
    await tip.waitFor();
    await shot(page, 'E9', 'tooltip-undo');
    await reset();

    await page.getByTestId('zoom-fit').hover();
    await tip.waitFor();
    await shot(page, 'E9', 'tooltip-status-right-edge');
    await reset();

    // Hover and pressed states side by side: hover Chain, press and hold Ring.
    await page.getByTestId('tool-chain').hover();
    await tip.waitFor();
    await page.getByTestId('tool-ring').hover();
    await page.mouse.down();
    await shot(page, 'E9', 'states-hover-pressed');
    await page.mouse.up();
    await reset();

    // Keyboard focus rings: a key press first, so script focus counts as keyboard focus.
    const focus = async (testId: string): Promise<void> => {
      await page.keyboard.press('Shift');
      await page.getByTestId(testId).focus();
    };
    const dismiss = async (): Promise<void> => {
      await page.keyboard.press('Escape');
    };

    await focus('tool-select');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await shot(page, 'E9', 'focus-rail-tooltip');
    await dismiss();
    await shot(page, 'E9', 'focus-rail');

    await page.getByTestId('tool-ring').click();
    await focus('opt-benzene');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await dismiss();
    await shot(page, 'E9', 'focus-option');

    await page.getByTestId('tool-atom').click();
    await focus('opt-Cl');
    await dismiss();
    await shot(page, 'E9', 'focus-option-text');

    await page.getByTestId('tool-select').click();
    await focus('act-clean');
    await dismiss();
    await shot(page, 'E9', 'focus-action');

    await focus('undo');
    await dismiss();
    await shot(page, 'E9', 'focus-undo');

    await page.keyboard.press('Shift');
    await page.getByLabel('Compound name').focus();
    await page.keyboard.type('benz');
    await shot(page, 'E9', 'focus-name-field');

    await focus('zoom-fit');
    await dismiss();
    await shot(page, 'E9', 'focus-status');

    await focus('tool-bond');
    await page.keyboard.press('Tab');
    await shot(page, 'E9', 'focus-canvas');

    await resizeContent(app, [960, 640]);
    await page.waitForFunction(() => window.innerWidth === 960 && window.innerHeight === 640);
    await page.getByTestId('zoom-fit').hover();
    await tip.waitFor();
    await shot(page, 'E9', 'tooltip-960');
  } finally {
    await app.close();
  }
});
