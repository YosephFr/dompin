export async function broadcastPickerError(
  tabId: number | undefined,
  message: string,
): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ kind: 'picker:error', tabId, message });
  } catch {
    // sidepanel may not have a listener yet; harmless
  }
}
