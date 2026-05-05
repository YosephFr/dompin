const STYLE_ID = 'dompin-crosshair-style';

export function applyCrosshairCursor(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `*, *::before, *::after { cursor: crosshair !important; }`;
  document.head?.appendChild(style);
}

export function removeCrosshairCursor(): void {
  document.getElementById(STYLE_ID)?.remove();
}
