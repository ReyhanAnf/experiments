// TIMELAPSE CONTINUITY — BACKGROUND SERVICE WORKER
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[TC Flow Automator] Extension installed/updated:', details.reason);
});

// Relay messages between popup and active tabs
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type === 'TC_BROADCAST_PROJECT') {
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id && tab.id !== sender.tab?.id) {
          chrome.tabs.sendMessage(tab.id, req).catch(() => {});
        }
      }
    });
    sendResponse({ ok: true });
  }
  return true;
});
