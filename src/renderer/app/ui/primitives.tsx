import { useEffect, useId, useRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { radioIndex } from '../model/radio-keys';

export function Icon({ name }: { name: string }): React.JSX.Element {
  return (
    <svg className="icon" aria-hidden="true">
      <use href={`#${name}`} />
    </svg>
  );
}
export function Button({
  disabled = false,
  variant = 'secondary',
  onClick,
  onPointerDown,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
}): React.JSX.Element {
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      className={`shell-button btn-${variant} ${className}`}
      aria-disabled={disabled}
      onClick={(e) => {
        if (disabled) {
          e.preventDefault();
          e.stopPropagation();
        } else onClick?.(e);
      }}
      onPointerDown={(e) => {
        if (disabled) {
          e.preventDefault();
          e.stopPropagation();
        } else onPointerDown?.(e);
      }}
    />
  );
}
export function Kbd({ children }: { children: ReactNode }): React.JSX.Element {
  return <kbd className="key">{children}</kbd>;
}
export interface RadioOption {
  value: string;
  title: string;
  description?: string;
  testId?: string;
}
interface GroupProps {
  label: string;
  value: string;
  options: readonly RadioOption[];
  onChange(value: string): void;
}
export function RadioCard({
  option,
  checked,
  tabIndex,
  onSelect,
}: {
  option: RadioOption;
  checked: boolean;
  tabIndex: number;
  onSelect(): void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="radio-card"
      role="radio"
      aria-checked={checked}
      tabIndex={tabIndex}
      data-testid={option.testId}
      onClick={onSelect}
    >
      <span className="radio-dot" aria-hidden="true" />
      <span className="radio-title">{option.title}</span>
      {option.description && <span className="radio-desc">{option.description}</span>}
    </button>
  );
}
function Group({
  label,
  value,
  options,
  onChange,
  segmented = false,
}: GroupProps & { segmented?: boolean }): React.JSX.Element {
  const selected = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={segmented ? 'seg' : 'radio-cards'}
      onKeyDown={(e) => {
        const next = radioIndex(selected, options.length, e.key);
        if (next === null) return;
        e.preventDefault();
        const option = options[next];
        if (!option) return;
        onChange(option.value);
        e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
      }}
    >
      {options.map((o, i) =>
        segmented ? (
          <button
            type="button"
            className="seg-item"
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            tabIndex={i === selected ? 0 : -1}
            data-testid={o.testId}
            onClick={() => onChange(o.value)}
          >
            {o.title}
          </button>
        ) : (
          <RadioCard
            key={o.value}
            option={o}
            checked={value === o.value}
            tabIndex={i === selected ? 0 : -1}
            onSelect={() => onChange(o.value)}
          />
        ),
      )}
    </div>
  );
}
export function RadioGroup(props: GroupProps): React.JSX.Element {
  return <Group {...props} />;
}
export function Segmented(props: GroupProps): React.JSX.Element {
  return <Group {...props} segmented />;
}
export function Checkbox({
  label,
  help,
  checked,
  disabled = false,
  testId,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  disabled?: boolean;
  testId?: string;
  onChange(checked: boolean): void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="checkbox"
      className="check"
      data-testid={testId}
      aria-checked={checked}
      aria-disabled={disabled}
      onPointerDown={(e) => {
        if (disabled) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onClick={(e) => {
        if (disabled) {
          e.preventDefault();
          e.stopPropagation();
        } else onChange(!checked);
      }}
    >
      <span className="check-box" aria-hidden="true">
        {checked && <Icon name="check" />}
      </span>
      <span className="check-label">{label}</span>
      {help && <span className="check-help">{help}</span>}
    </button>
  );
}
/** The dialog's Enter: a plain Enter that does not end an IME composition. */
export function isDialogEnter(e: {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  isComposing: boolean;
}): boolean {
  return (
    e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && !e.isComposing
  );
}
export function Dialog({
  title,
  testId = 'dialog',
  width = 400,
  className = '',
  onCancel,
  onEnter,
  children,
  footer,
}: {
  title: string;
  testId?: string;
  width?: 400 | 560;
  /** Added to the dialog box's classes. */
  className?: string;
  onCancel(): void;
  /** Enter anywhere in the dialog (the dialog's default button); the key is consumed. */
  onEnter?(): void;
  children: ReactNode;
  footer?: ReactNode;
}): React.JSX.Element {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    const focusables = (): HTMLElement[] =>
      dialog
        ? [
            ...dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]'),
          ].filter((e) => e.tabIndex >= 0 && !e.hasAttribute('disabled'))
        : [];
    (focusables()[0] ?? dialog)?.focus();
    const trap = (e: FocusEvent): void => {
      if (dialog && !dialog.contains(e.target as Node)) (focusables()[0] ?? dialog).focus();
    };
    document.addEventListener('focusin', trap);
    return () => {
      document.removeEventListener('focusin', trap);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <div
      className="shell-modal"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
        if (onEnter && isDialogEnter({ ...e, isComposing: e.nativeEvent.isComposing })) {
          e.preventDefault();
          e.stopPropagation();
          onEnter();
        }
        if (e.key === 'Tab') {
          const items = [
            ...(ref.current?.querySelectorAll<HTMLElement>(
              'button, input, select, textarea, [tabindex]',
            ) ?? []),
          ].filter((el) => el.tabIndex >= 0 && !el.hasAttribute('disabled'));
          const index = items.indexOf(document.activeElement as HTMLElement);
          if (items.length === 0) {
            e.preventDefault();
            ref.current?.focus();
          } else if (e.shiftKey && index <= 0) {
            e.preventDefault();
            items.at(-1)?.focus();
          } else if (!e.shiftKey && index === items.length - 1) {
            e.preventDefault();
            items[0]?.focus();
          }
        }
      }}
    >
      <div className="scrim" onClick={onCancel} />
      <div
        ref={ref}
        tabIndex={-1}
        data-testid={testId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={`dialog dialog-${width === 400 ? 'sm' : 'md'}${className ? ` ${className}` : ''}`}
      >
        <h2 id={id} className="dialog-title">
          {title}
        </h2>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}
