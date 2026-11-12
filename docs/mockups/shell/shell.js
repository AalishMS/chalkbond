// Layout helpers for the static shell mock-ups (no behaviour). Native popups are placed in page
// coordinates on whole pixels:
//   data-anchor="id" data-side="below"  a menu under a menu-bar item
//   data-anchor="id" data-side="right"  a submenu beside its item (overlapping 4 px, as Windows)
//   data-at="id"                        a menu or pointer at the middle of a control (a context menu)
//   data-center="win"                   a message box centred over the window
//   data-for="id" data-side="below"     an in-window tooltip under its control
const doc = globalThis.document;

function rectOf(id) {
  const el = doc.getElementById(id);
  return el ? el.getBoundingClientRect() : null;
}

for (const el of doc.querySelectorAll('[data-anchor]')) {
  const a = rectOf(el.dataset.anchor);
  if (!a) continue;
  if (el.dataset.side === 'right') {
    el.style.left = `${Math.round(a.right)}px`;
    el.style.top = `${Math.round(a.top - 5)}px`;
  } else {
    el.style.left = `${Math.round(a.left)}px`;
    el.style.top = `${Math.round(a.bottom)}px`;
  }
}

for (const el of doc.querySelectorAll('[data-at]')) {
  const a = rectOf(el.dataset.at);
  if (!a) continue;
  el.style.left = `${Math.round(a.left + a.width / 2)}px`;
  el.style.top = `${Math.round(a.top + a.height / 2 + 6)}px`;
}

for (const el of doc.querySelectorAll('[data-center]')) {
  const w = doc.querySelector('.win').getBoundingClientRect();
  const b = el.getBoundingClientRect();
  const dx = Number(el.dataset.dx ?? 0);
  el.style.left = `${Math.round(w.left + (w.width - b.width) / 2 + dx)}px`;
  el.style.top = `${Math.round(w.top + (w.height - b.height) / 2 - 40)}px`;
}

for (const tip of doc.querySelectorAll('.tooltip[data-for]')) {
  const a = rectOf(tip.dataset.for);
  if (!a) continue;
  const parent = tip.offsetParent.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const x = Math.min(a.left + (a.width - t.width) / 2, parent.right - 8 - t.width);
  tip.style.left = `${Math.round(x - parent.left)}px`;
  tip.style.top = `${Math.round(a.bottom + 8 - parent.top)}px`;
}
