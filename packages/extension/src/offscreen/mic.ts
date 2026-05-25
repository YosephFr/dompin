/**
 * DOMPin microphone permission window.
 *
 * An offscreen document can record but cannot surface Chrome's permission
 * prompt. This small, visible extension-origin window does: it calls
 * getUserMedia, which prompts the user to allow the microphone for the
 * extension. Once granted, the permission persists for the extension origin, so
 * the offscreen recorder works silently from then on — on every site. The window
 * tells the background worker the moment access is granted.
 */

const statusEl = document.getElementById('status');
const buttonEl = document.getElementById('enable') as HTMLButtonElement | null;

function setStatus(text: string, tone: 'idle' | 'ok' | 'error'): void {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.dataset.tone = tone;
}

async function requestMicrophone(): Promise<void> {
  if (buttonEl) buttonEl.disabled = true;
  setStatus('Waiting for your permission…', 'idle');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    setStatus('Microphone enabled — recording will start automatically.', 'ok');
    chrome.runtime.sendMessage({ target: 'dompin-mic', ok: true });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      setStatus('No microphone was found on this device.', 'error');
    } else {
      setStatus(
        'Access was blocked. Click “Enable microphone” to try again, or allow it from the icon in the address bar.',
        'error',
      );
    }
    if (buttonEl) buttonEl.disabled = false;
  }
}

buttonEl?.addEventListener('click', () => void requestMicrophone());

// Surface the prompt as soon as the window opens; the button is the retry path.
void requestMicrophone();
