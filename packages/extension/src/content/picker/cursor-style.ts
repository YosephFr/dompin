const STYLE_ID = 'dompin-crosshair-style';

export function applyCrosshairCursor(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  // crosshair while picking, plus user-select:none so dragging a region never
  // highlights the page's text underneath. Removed on pause/stop, so the
  // comment popup's textarea (picker is paused while it's open) stays editable.
  style.textContent = `*, *::before, *::after {
  cursor: crosshair !important;
  user-select: none !important;
  -webkit-user-select: none !important;
}`;
  document.head?.appendChild(style);
}

export function removeCrosshairCursor(): void {
  document.getElementById(STYLE_ID)?.remove();
}
