export class Highlight {
  private box: HTMLDivElement;
  private tooltip: HTMLDivElement;
  private currentEl: Element | null = null;
  private rafId: number | null = null;

  constructor(layer: HTMLElement) {
    this.box = document.createElement('div');
    this.box.className = 'dp-highlight';
    this.box.style.opacity = '0';
    layer.appendChild(this.box);

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'dp-tooltip';
    this.tooltip.style.opacity = '0';
    layer.appendChild(this.tooltip);

    addEventListener('scroll', this.onScrollOrResize, true);
    addEventListener('resize', this.onScrollOrResize);
  }

  show(el: Element): void {
    this.currentEl = el;
    this.render();
  }

  hide(): void {
    this.currentEl = null;
    this.box.style.opacity = '0';
    this.tooltip.style.opacity = '0';
  }

  destroy(): void {
    removeEventListener('scroll', this.onScrollOrResize, true);
    removeEventListener('resize', this.onScrollOrResize);
    this.box.remove();
    this.tooltip.remove();
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
  }

  private onScrollOrResize = (): void => {
    if (!this.currentEl) return;
    if (this.rafId != null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.render();
    });
  };

  private render(): void {
    if (!this.currentEl || !this.currentEl.isConnected) {
      this.hide();
      return;
    }
    const rect = this.currentEl.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      this.hide();
      return;
    }
    this.box.style.opacity = '1';
    this.box.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
    this.box.style.width = `${rect.width}px`;
    this.box.style.height = `${rect.height}px`;
    this.box.style.left = '0';
    this.box.style.top = '0';

    this.tooltip.innerHTML = this.tooltipHtml(this.currentEl, rect);
    this.tooltip.style.opacity = '1';

    const tipW = this.tooltip.offsetWidth;
    const tipH = this.tooltip.offsetHeight;
    const margin = 6;
    let x = rect.left;
    let y = rect.top - tipH - margin;
    if (y < 4) y = rect.bottom + margin;
    if (x + tipW > window.innerWidth - 4) x = window.innerWidth - tipW - 4;
    if (x < 4) x = 4;
    this.tooltip.style.transform = `translate(${x}px, ${y}px)`;
    this.tooltip.style.left = '0';
    this.tooltip.style.top = '0';
  }

  private tooltipHtml(el: Element, rect: DOMRect): string {
    const tag = `<span class="tag">${escapeHtml(el.tagName.toLowerCase())}</span>`;
    const id = el.id ? `<span class="id">#${escapeHtml(el.id)}</span>` : '';
    const classes = Array.from(el.classList)
      .slice(0, 2)
      .map((c) => `<span class="cls">.${escapeHtml(c)}</span>`)
      .join('');
    const dim = `<span class="dim">${Math.round(rect.width)} × ${Math.round(rect.height)}</span>`;
    return `${tag}${id}${classes}${dim}`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
