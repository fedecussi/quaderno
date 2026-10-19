// Click sull'icona: apre Quaderno in una scheda (riusa quella già aperta, se c'è).
const APP = chrome.runtime.getURL("index.html");
chrome.action.onClicked.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: APP + "*" });
  if (tabs.length && tabs[0].id != null) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId != null) await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: APP });
  }
});
