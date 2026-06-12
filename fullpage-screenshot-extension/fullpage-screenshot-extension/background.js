/**
 * background.js
 * Manifest V3 Service Worker.
 *
 * Responsibilities:
 *   - Listen for CAPTURE_START message from popup.
 *   - Orchestrate the full-page capture via capture logic.
 *   - Stream progress back to popup via chrome.runtime.sendMessage.
 *   - Store the result in chrome.storage.session for popup retrieval.
 *   - Trigger chrome.downloads for the final PNG.
 *
 * NOTE: Service workers cannot use FileReaderSync, so we perform the
 *       canvas → blob → dataURL conversion here using async FileReader.
 */

'use strict';

// ── Helpers ──────────────────────────────────────────────────

/**
 * Sends a message to the popup (best-effort; popup may be closed).
 */
function notifyPopup(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup may not be listening — that's fine.
  });
}

/**
 * Sends a message to the content script in a specific tab.
 */
function sendToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response || !response.success) {
        reject(new Error(response?.error || 'Content script error'));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Captures the visible tab as a PNG dataURL.
 */
function captureVisible(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: 'png', quality: 100 }, (dataUrl) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(dataUrl);
    });
  });
}

/**
 * Fetches a dataURL and returns an ImageBitmap.
 */
async function toBitmap(dataUrl) {
  const res  = await fetch(dataUrl);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

/**
 * Converts an OffscreenCanvas to a PNG dataURL.
 */
async function canvasToDataUrl(canvas) {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

/**
 * Pause for `ms` milliseconds.
 */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Main capture routine ──────────────────────────────────────

/**
 * Performs the full-page screenshot capture for the active tab.
 * @param {chrome.tabs.Tab} tab
 */
async function runCapture(tab) {
  const tabId    = tab.id;
  const windowId = tab.windowId;

  const sendProgress = (percent, status) => {
    notifyPopup({ type: 'CAPTURE_PROGRESS', percent, status });
  };

  try {
    // ── 1. Inject content script ──────────────────────────────
    sendProgress(3, 'Injecting capture script…');
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    } catch (err) {
      if (/Cannot access|restricted|cannot be scripted/i.test(err.message)) {
        throw new Error('This page is restricted and cannot be captured.\nTry a regular website.');
      }
      // Script may already be injected — continue.
    }

    await wait(150);
    sendProgress(6, 'Reading page dimensions…');

    // ── 2. Get full page dimensions ───────────────────────────
    const { data: dims } = await sendToTab(tabId, { action: 'GET_PAGE_DIMENSIONS' });
    const { fullWidth, fullHeight, viewportWidth, viewportHeight, devicePixelRatio: dpr } = dims;

    // Hard cap to prevent OOM on extremely long pages
    const MAX_CSS_HEIGHT = 30000;

    sendProgress(9, 'Preparing page…');

    // ── 3. Save state & hide fixed elements ───────────────────
    await sendToTab(tabId, { action: 'SAVE_SCROLL' });
    await sendToTab(tabId, { action: 'HIDE_FIXED' });
    await wait(100);

    // ── 4b. Re-measure: scroll to bottom first to get the TRUE final height ──
    // Many sites lazy-load content or have inaccurate scrollHeight until
    // the user actually scrolls. Scrolling to the bottom first forces
    // layout/content to fully render, then we re-read the dimensions.
    sendProgress(10, 'Measuring full page height…');
    await sendToTab(tabId, { action: 'SCROLL_TO', x: 0, y: 999999, delay: 350 });
    const { data: dimsAfterScroll } = await sendToTab(tabId, { action: 'GET_PAGE_DIMENSIONS' });
    const measuredHeight = Math.max(fullHeight, dimsAfterScroll.fullHeight, dimsAfterScroll.scrollY + viewportHeight);
    const finalTotalHeight = Math.min(measuredHeight, MAX_CSS_HEIGHT);

    // Scroll back to top to begin the capture pass
    await sendToTab(tabId, { action: 'SCROLL_TO', x: 0, y: 0, delay: 250 });

    // ── 4. Scroll and capture strips ─────────────────────────
    const strips = [];
    let currentY = 0;
    let lastScrollY = -1;
    let safetyCounter = 0;
    const MAX_STRIPS = 200; // hard safety cap (covers ~30000px even on small viewports)
    const estimatedStrips = Math.max(1, Math.ceil(finalTotalHeight / viewportHeight));

    while (true) {
      safetyCounter++;
      if (safetyCounter > MAX_STRIPS) break;

      const pct = 10 + Math.min(70, Math.round((strips.length / estimatedStrips) * 70));
      sendProgress(pct, `Capturing section ${strips.length + 1}…`);

      // Scroll to the target position
      const scrollResult = await sendToTab(tabId, {
        action: 'SCROLL_TO',
        x: 0,
        y: currentY,
        delay: 250, // give layout/images/lazy-load time to settle
      });
      const actualY = scrollResult.data.scrollY;

      // Throttle: chrome.tabs.captureVisibleTab allows ~2 calls/sec.
      // Wait a bit before capturing to avoid MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND errors.
      await wait(120);

      // Capture visible area (retry once on rate-limit error)
      let dataUrl;
      try {
        dataUrl = await captureVisible(windowId);
      } catch (capErr) {
        if (/MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND/i.test(capErr.message)) {
          await wait(700);
          dataUrl = await captureVisible(windowId);
        } else {
          throw capErr;
        }
      }

      strips.push({ dataUrl, scrollY: actualY });

      // Stop condition: the page did not scroll further than last time,
      // meaning we've reached (or stayed at) the bottom.
      if (actualY === lastScrollY) {
        break;
      }

      // If we're already at/past the bottom of the measured page, stop
      // after capturing this final strip.
      if (actualY + viewportHeight >= finalTotalHeight) {
        break;
      }

      lastScrollY = actualY;
      currentY = actualY + viewportHeight;
    }

    // ── 5. Restore page state ─────────────────────────────────
    sendProgress(82, 'Restoring page…');
    await sendToTab(tabId, { action: 'RESTORE_FIXED' });
    await sendToTab(tabId, { action: 'RESTORE_SCROLL' });

    // ── 6. Load ImageBitmaps ──────────────────────────────────
    sendProgress(86, 'Loading image strips…');
    const bitmaps = await Promise.all(strips.map((s) => toBitmap(s.dataUrl)));

    // ── 7. Stitch on OffscreenCanvas ─────────────────────────
    sendProgress(90, 'Stitching image…');

    // Determine the true content height: the larger of our measured height
    // and the bottom edge reached by the final captured strip (covers cases
    // where the page grew slightly during capture, e.g. infinite scroll).
    const lastStrip = strips[strips.length - 1];
    const reachedHeight = lastStrip ? lastStrip.scrollY + viewportHeight : finalTotalHeight;
    const outputHeight = Math.min(Math.max(finalTotalHeight, reachedHeight), MAX_CSS_HEIGHT);

    const physW     = Math.round(viewportWidth * dpr);
    const physH     = Math.round(viewportHeight * dpr);
    const physTotal = Math.round(outputHeight   * dpr);

    const canvas = new OffscreenCanvas(physW, physTotal);
    const ctx    = canvas.getContext('2d');

    for (let i = 0; i < strips.length; i++) {
      const { scrollY } = strips[i];
      const bitmap      = bitmaps[i];

      const destY        = Math.round(scrollY * dpr);
      const allowedH     = physTotal - destY;
      const drawH        = Math.min(physH, allowedH);

      if (drawH <= 0) { bitmap.close(); continue; }

      ctx.drawImage(bitmap, 0, 0, bitmap.width, drawH, 0, destY, physW, drawH);
      bitmap.close();
    }

    sendProgress(95, 'Exporting PNG…');

    // ── 8. Export to PNG dataURL ──────────────────────────────
    const blob      = await canvas.convertToBlob({ type: 'image/png' });
    const dataUrl   = await canvasToDataUrl(canvas);
    const fileSize  = blob.size;

    // Store result in session storage for popup retrieval
    await chrome.storage.session.set({
      screenshotResult: { dataUrl, width: viewportWidth, height: outputHeight, fileSize },
    });

    sendProgress(100, 'Capture complete!');
    notifyPopup({ type: 'CAPTURE_DONE', width: viewportWidth, height: outputHeight, fileSize });

  } catch (err) {
    console.error('[FullPageScreenshot] Capture error:', err);

    // Attempt to restore page state even on error
    try {
      await sendToTab(tabId, { action: 'RESTORE_FIXED' });
      await sendToTab(tabId, { action: 'RESTORE_SCROLL' });
    } catch (_) { /* ignore cleanup errors */ }

    notifyPopup({ type: 'CAPTURE_ERROR', message: err.message || 'An unknown error occurred.' });
  }
}

// ── Download helper ───────────────────────────────────────────

/**
 * Generates a timestamped filename for the screenshot.
 */
function generateFilename() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const d = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const t = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `fullpage-screenshot-${d}-${t}.png`;
}

/**
 * Triggers a download of the stored screenshot.
 *
 * NOTE: We pass the data URL directly to chrome.downloads.download().
 * Blob URLs created via URL.createObjectURL() inside a service worker
 * are unreliable because the worker can be terminated/recycled before
 * the download manager resolves the URL, causing silent failures.
 * Data URLs have no such lifecycle dependency.
 */
async function downloadScreenshot() {
  const stored = await chrome.storage.session.get('screenshotResult');
  if (!stored.screenshotResult) {
    notifyPopup({ type: 'DOWNLOAD_ERROR', message: 'No screenshot data found. Please capture again.' });
    return;
  }

  const { dataUrl } = stored.screenshotResult;
  const filename = generateFilename();

  chrome.downloads.download(
    {
      url: dataUrl,
      filename,
      saveAs: false,
      conflictAction: 'uniquify',
    },
    (downloadId) => {
      if (chrome.runtime.lastError || downloadId === undefined) {
        const errMsg = chrome.runtime.lastError?.message || 'Download failed to start.';
        console.error('[FullPageScreenshot] Download error:', errMsg);
        notifyPopup({ type: 'DOWNLOAD_ERROR', message: errMsg });
        return;
      }
      notifyPopup({ type: 'DOWNLOAD_STARTED', downloadId, filename });
    }
  );
}

// ── Message router ────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_CAPTURE') {
    // Get the active tab and kick off capture
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) {
        notifyPopup({ type: 'CAPTURE_ERROR', message: 'No active tab found.' });
        return;
      }

      const url = tab.url || '';
      if (/^chrome:\/\/|^chrome-extension:\/\/|^edge:\/\/|^about:/i.test(url)) {
        notifyPopup({
          type: 'CAPTURE_ERROR',
          message: 'Chrome internal pages cannot be captured.\nNavigate to a regular website and try again.',
        });
        return;
      }

      runCapture(tab);
    });

    sendResponse({ received: true });
    return true;
  }

  if (message.type === 'DOWNLOAD_SCREENSHOT') {
    downloadScreenshot();
    sendResponse({ received: true });
    return true;
  }
});
