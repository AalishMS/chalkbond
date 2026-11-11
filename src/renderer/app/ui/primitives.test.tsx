import { renderToStaticMarkup as render } from 'react-dom/server';
import { expect, it } from 'vitest';
import {
  Button,
  Checkbox,
  Dialog,
  Icon,
  isDialogEnter,
  Kbd,
  RadioGroup,
  scrolledTop,
  Segmented,
} from './primitives';
it('exposes named, focusable disabled controls', () => {
  const html = render(
    <Button disabled title="Nothing to save" data-testid="save">
      Save
    </Button>,
  );
  expect(html).toContain('aria-disabled="true"');
  expect(html).not.toContain(' disabled=');
  expect(html).toContain('data-testid="save"');
  expect(html).toContain('Nothing to save');
  expect(
    render(<Checkbox label="White background" checked onChange={() => undefined} />),
  ).toContain('aria-checked="true"');
});
it('renders a single radio tab stop in both presentations', () => {
  const props = {
    label: 'Size',
    value: 'print',
    onChange: () => undefined,
    options: [
      { value: 'screen', title: 'Screen' },
      { value: 'print', title: 'Print', description: 'Sharp' },
    ],
  };
  for (const Component of [RadioGroup, Segmented]) {
    const html = render(<Component {...props} />);
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
  }
});
it('renders dialog labelling and decorative sprite references and keys', () => {
  expect(
    render(
      <Dialog title="Export" onCancel={() => undefined}>
        Content
      </Dialog>,
    ),
  ).toContain('aria-modal="true"');
  expect(render(<Icon name="copy" />)).toContain('href="#copy"');
  expect(render(<Kbd>Ctrl</Kbd>)).toContain('<kbd');
});
it('suppresses disabled click and pointer handlers', () => {
  let calls = 0;
  let prevented = 0;
  let stopped = 0;
  const element = Button({ disabled: true, onClick: () => calls++, onPointerDown: () => calls++ });
  const props = element.props as { onClick(e: unknown): void; onPointerDown(e: unknown): void };
  const event = { preventDefault: () => prevented++, stopPropagation: () => stopped++ };
  props.onClick(event);
  props.onPointerDown(event);
  expect(calls).toBe(0);
  expect(prevented).toBe(2);
  expect(stopped).toBe(2);
});
it('C10: test ids on options and checkbox, a dialog class, and the Enter handler', () => {
  const options = [
    { value: 'a', title: 'A', testId: 'opt-a' },
    { value: 'b', title: 'B', testId: 'opt-b' },
  ];
  for (const Component of [RadioGroup, Segmented]) {
    const html = render(<Component label="L" value="a" options={options} onChange={() => {}} />);
    expect(html).toContain('data-testid="opt-a"');
    expect(html).toContain('data-testid="opt-b"');
  }
  expect(
    render(<Checkbox label="W" checked={false} testId="white" onChange={() => undefined} />),
  ).toContain('data-testid="white"');
  expect(
    render(
      <Dialog title="T" className="export-dialog" onCancel={() => undefined}>
        x
      </Dialog>,
    ),
  ).toMatch(/class="dialog dialog-sm export-dialog"/);
  const key = (k: string, mods: Partial<Parameters<typeof isDialogEnter>[0]> = {}) => ({
    key: k,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    isComposing: false,
    ...mods,
  });
  expect(isDialogEnter(key('Enter'))).toBe(true);
  for (const mods of [{ ctrlKey: true }, { altKey: true }, { shiftKey: true }, { metaKey: true }])
    expect(isDialogEnter(key('Enter', mods))).toBe(false);
  expect(isDialogEnter(key('Enter', { isComposing: true }))).toBe(false);
  expect(isDialogEnter(key(' '))).toBe(false);
});

it('scrolledTop: arrows step 40, pages step a view less 40, Home and End, clamped, other keys null', () => {
  // A 200 px view over 500 px of content: the last scrollTop is 300.
  expect(scrolledTop('ArrowDown', 0, 200, 500)).toBe(40);
  expect(scrolledTop('ArrowUp', 20, 200, 500)).toBe(0);
  expect(scrolledTop('PageDown', 0, 200, 500)).toBe(160);
  expect(scrolledTop('PageUp', 100, 200, 500)).toBe(0);
  expect(scrolledTop('End', 0, 200, 500)).toBe(300);
  expect(scrolledTop('Home', 250, 200, 500)).toBe(0);
  expect(scrolledTop('ArrowDown', 290, 200, 500)).toBe(300);
  expect(scrolledTop('PageDown', 0, 30, 500)).toBe(40);
  expect(scrolledTop('a', 0, 200, 500)).toBeNull();
  expect(scrolledTop(' ', 0, 200, 500)).toBeNull();
});
