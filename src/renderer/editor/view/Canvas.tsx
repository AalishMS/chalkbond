import { useEffect, useRef } from 'react';
import { HINT_ID } from './StatusBar';

/**
 * The drawing area. One tab stop (K4), focused at launch (Decision 5); the status-bar hint
 * describes it. The drawing surface arrives with E12.
 */
export function Canvas({ children }: { children?: React.ReactNode }): React.JSX.Element {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.focus();
    // The ring shows only when Tab brought focus here (not at launch, not after a click).
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Tab') canvas.dataset['keyboard'] = '';
    };
    const clear = (): void => {
      delete canvas.dataset['keyboard'];
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', clear, true);
    canvas.addEventListener('blur', clear);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', clear, true);
      canvas.removeEventListener('blur', clear);
    };
  }, []);
  return (
    <main
      ref={ref}
      className="canvas"
      data-testid="canvas"
      role="application"
      aria-label="Drawing canvas"
      aria-describedby={HINT_ID}
      tabIndex={0}
    >
      {children}
    </main>
  );
}
