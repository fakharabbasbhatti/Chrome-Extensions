// background.js - Service Worker for Website Brand & Contact Extractor

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'analyzeUrl') {
    analyzeWebsite(message.url)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }
});

async function analyzeWebsite(url) {
  // Validate and normalize URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  try { new URL(url); } catch {
    throw new Error('Invalid URL. Please enter a valid website address.');
  }

  // Check if a tab with this origin is already open — reuse it to avoid CSP issues
  const parsedUrl = new URL(url);
  const tabs = await chrome.tabs.query({});
  let targetTab = tabs.find(t => {
    try { return new URL(t.url).origin === parsedUrl.origin; } catch { return false; }
  });

  let createdTab = false;
  if (!targetTab) {
    targetTab = await chrome.tabs.create({ url, active: false });
    createdTab = true;
    await waitForTabLoad(targetTab.id);
  } else {
    // Reload to ensure fresh state
    await chrome.tabs.reload(targetTab.id);
    await waitForTabLoad(targetTab.id);
  }

  try {
    // Inject utility scripts first, then coordinator
    await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      files: ['utils/colorExtractor.js']
    });
    await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      files: ['utils/contactExtractor.js']
    });
    await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      files: ['utils/socialExtractor.js']
    });
    await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      files: ['content.js']
    });

    // Run extraction
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: () => window.__extractSiteData ? window.__extractSiteData() : null
    });

    const data = results[0]?.result;
    if (!data) throw new Error('Could not extract data from this website.');
    if (data.error) throw new Error(data.error);
    return data;

  } finally {
    if (createdTab) {
      try { await chrome.tabs.remove(targetTab.id); } catch { /* already closed */ }
    }
  }
}

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Page took too long to load. Try again.'));
    }, 25000);

    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        // Extra wait for JS frameworks (React, Vue, etc.) to finish rendering
        setTimeout(resolve, 2000);
      }
    }

    chrome.tabs.onUpdated.addListener(listener);

    // Also check if tab is already loaded
    chrome.tabs.get(tabId, tab => {
      if (tab?.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 2000);
      }
    });
  });
}
