import type { RectInfo } from '@dompin/shared';

export class RegionRect {
  private el: HTMLDivElement;
  private active = false;

  constructor(layer: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'dp-region';
    this.el.style.display = 'none';
    layer.appendChild(this.el);
  }

  show(rect: RectInfo): void {
    this.active = true;
    this.el.style.display = 'block';
    this.el.style.left = '0';
    this.el.style.top = '0';
    this.el.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
    this.el.style.width = `${rect.width}px`;
    this.el.style.height = `${rect.height}px`;
  }

  hide(): void {
    this.active = false;
    this.el.style.display = 'none';
  }

  isActive(): boolean {
    return this.active;
  }

  destroy(): void {
    this.el.remove();
  }
}
