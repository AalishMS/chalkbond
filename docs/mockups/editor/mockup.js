// Places each `.tooltip[data-for]` beside its anchor (SPEC-editor.md "Tooltips": right of rail
// buttons, below top-bar controls, above status-bar controls, 8 px gap, flipped or clamped to
// stay inside the window), on whole pixels. Layout only; the mock-ups have no behaviour.
const GAP = 8;
const EDGE = 8;

function place(tip) {
  const doc = globalThis.document;
  const anchor = doc.getElementById(tip.dataset.for);
  if (!anchor) return;
  const a = anchor.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const w = globalThis.innerWidth;
  const h = globalThis.innerHeight;
  const side = tip.dataset.side ?? 'below';
  let x;
  let y;
  if (side === 'right') {
    x = a.right + GAP;
    y = a.top + (a.height - t.height) / 2;
  } else if (side === 'above') {
    x = a.left + (a.width - t.width) / 2;
    y = a.top - GAP - t.height;
  } else {
    x = a.left + (a.width - t.width) / 2;
    y = a.bottom + GAP;
  }
  x = Math.min(Math.max(x, EDGE), w - EDGE - t.width);
  y = Math.min(Math.max(y, EDGE), h - EDGE - t.height);
  tip.style.left = `${Math.round(x)}px`;
  tip.style.top = `${Math.round(y)}px`;
}

for (const tip of globalThis.document.querySelectorAll('.tooltip[data-for]')) place(tip);
