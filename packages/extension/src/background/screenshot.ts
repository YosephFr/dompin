import type { RectInfo } from '../common/types.js';

export async function captureViewport(tabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      const tabErr = chrome.runtime.lastError;
      if (tabErr || !tab) {
        reject(new Error(tabErr?.message ?? 'tab not found'));
        return;
      }
      const windowId = tab.windowId;
      try {
        chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message ?? 'captureVisibleTab failed'));
            return;
          }
          if (!dataUrl) {
            reject(new Error('captureVisibleTab returned empty'));
            return;
          }
          resolve(dataUrl);
        });
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  });
}

export async function cropDataUrl(
  dataUrl: string,
  rect: RectInfo,
  dpr: number,
  padding: number,
): Promise<string> {
  const blob = await dataUrlToBlob(dataUrl);
  const bitmap = await createImageBitmap(blob);
  try {
    const imgW = bitmap.width;
    const imgH = bitmap.height;
    const padPx = padding * dpr;
    let cropX = Math.floor(rect.x * dpr - padPx);
    let cropY = Math.floor(rect.y * dpr - padPx);
    let cropW = Math.ceil(rect.width * dpr + padPx * 2);
    let cropH = Math.ceil(rect.height * dpr + padPx * 2);
    cropX = clamp(cropX, 0, imgW);
    cropY = clamp(cropY, 0, imgH);
    cropW = clamp(cropW, 1, imgW - cropX);
    cropH = clamp(cropH, 1, imgH - cropY);
    const canvas = new OffscreenCanvas(cropW, cropH);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas 2d unavailable');
    ctx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    const out = await canvas.convertToBlob({ type: 'image/png' });
    return blobToDataUrl(out);
  } finally {
    bitmap.close();
  }
}

export async function captureElement(
  tabId: number,
  rect: RectInfo,
  dpr: number,
  padding = 24,
): Promise<string> {
  const viewport = await captureViewport(tabId);
  return cropDataUrl(viewport, rect, dpr, padding);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const resp = await fetch(dataUrl);
  return resp.blob();
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);
  return `data:${blob.type || 'image/png'};base64,${base64}`;
}
