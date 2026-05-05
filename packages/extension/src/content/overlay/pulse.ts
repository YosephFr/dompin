export function showPulse(
  layer: HTMLElement,
  rect: { x: number; y: number; width: number; height: number },
  durationMs: number,
): void {
  const el = document.createElement('div');
  el.className = 'dp-pulse';
  el.style.left = '0';
  el.style.top = '0';
  el.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
  el.style.animationDuration = `${durationMs}ms`;
  layer.appendChild(el);
  window.setTimeout(() => el.remove(), durationMs + 80);
}
