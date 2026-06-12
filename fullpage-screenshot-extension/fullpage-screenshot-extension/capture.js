/**
 * capture.js
 * Core full-page screenshot capture engine.
 *
 * Strategy:
 *   1. Inject content script to get full page dimensions.
 *   2. Compute strip layout (how many viewport-height strips we need).
 *   3. For each strip: scroll page → wait → chrome.tabs.captureVisibleTab().
 *   4. Collect all strip DataURLs, then stitch them on an OffscreenCanvas.
 *   5. Return the final PNG DataURL to the caller.
 *
 * Note: captureVisibleTab captures at the device's pixel ratio so we must
 * account for that when positioning strips on the final canvas.
 */

/**
 * @typedef {Object} CaptureOptions
 * @property {number} tabId        - Chrome tab ID to capture.
 * @property {number} windowId     - Chrome window ID (for captureVisibleTab).
 * @property {function(number):void} [onProgress] - Called with 0-100 progress values.
 * @property {function(string):void} [onStatus]   - Called with human-readable status text.
 */

/**
 * @typedef {Object} CaptureResult
 * @property {string}  dataUrl   - PNG DataURL of the full page.
 * @property {number}  width     - Pixel width of the output image (CSS px).
 * @property {number}  height    - Pixel height of the output image (CSS px).
 */

/**
 * Sends a message to the content script in the given tab and awaits a response.
 * @param {number} tabId
 * @param {object} message
 * @returns {Promise<object>}
 */
async function sendToContent(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response || !response.success) {
        reject(new Error(response?.error || 'Content script returned failure'));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Captures a single visible tab screenshot.
 * @param {number} windowId
 * @returns {Promise<string>} DataURL (PNG)
 */
async function captureVisibleTab(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(
      windowId,
      { format: 'png', quality: 100 },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(dataUrl);
        }
      }
    );
  });
}

/**
 * Loads a DataURL into an ImageBitmap (works in service workers).
 * @param {string} dataUrl
 * @returns {Promise<ImageBitmap>}
 */
async function dataUrlToImageBitmap(dataUrl) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

/**
 * Waits for a given number of milliseconds.
 * @param {number} ms
 */
function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Performs the full-page capture for the given tab.
 * @param {CaptureOptions} options
 * @returns {Promise<CaptureResult>}
 */
async function captureFullPage({ tabId, windowId, onProgress, onStatus }) {
  const progress = (p) => onProgress && onProgress(Math.round(p));
  const status   = (s) => onStatus   && onStatus(s);

  // ── Step 1: Inject content script ──────────────────────────
  status('Injecting capture script…');
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
  } catch (err) {
    // Content script may already be injected — that's fine.
    // But if the URL is truly restricted this will throw.
    if (err.message.includes('Cannot access') || err.message.includes('restricted')) {
      throw new Error('This page cannot be captured. Try a regular webpage.');
    }
  }

  // Small pause so the content script listener is ready
  await wait(120);
  progress(5);

  // ── Step 2: Get page dimensions ─────────────────────────────
  status('Reading page dimensions…');
  const { data: dims } = await sendToContent(tabId, { action: 'GET_PAGE_DIMENSIONS' });

  const {
    fullWidth,
    fullHeight,
    viewportWidth,
    viewportHeight,
    devicePixelRatio: dpr,
  } = dims;

  // Safety cap: prevent runaway memory on extremely long pages
  const MAX_HEIGHT = 32000; // CSS pixels
  const effectiveHeight = Math.min(fullHeight, MAX_HEIGHT);

  progress(8);

  // ── Step 3: Save state & hide fixed elements ─────────────────
  status('Preparing page…');
  await sendToContent(tabId, { action: 'SAVE_SCROLL' });
  await sendToContent(tabId, { action: 'HIDE_FIXED' });
  await wait(80);
  progress(10);

  // ── Step 4: Scroll and capture strips ───────────────────────
  const strips = [];
  let currentY = 0;
  let stripIndex = 0;

  // Calculate total number of strips needed
  const totalStrips = Math.ceil(effectiveHeight / viewportHeight);
  const captureProgressRange = 75; // 10% → 85%

  status(`Capturing ${totalStrips} section${totalStrips !== 1 ? 's' : ''}…`);

  while (currentY < effectiveHeight) {
    // Scroll to the position
    const scrollResult = await sendToContent(tabId, {
      action: 'SCROLL_TO',
      x: 0,
      y: currentY,
      delay: 180, // Give dynamic content time to render
    });

    // How far the page actually scrolled (may be capped at max scroll)
    const actualScrollY = scrollResult.data.scrollY;

    // Capture the visible area
    const dataUrl = await captureVisibleTab(windowId);

    strips.push({
      dataUrl,
      scrollY:     actualScrollY,
      targetY:     currentY,       // Where we intended to scroll
      viewportH:   viewportHeight,
    });

    stripIndex++;
    const pct = 10 + Math.round((stripIndex / totalStrips) * captureProgressRange);
    progress(pct);

    const prev = currentY;
    currentY += viewportHeight;

    // If the page didn't scroll further (we've hit the bottom), stop
    if (actualScrollY <= prev && currentY > viewportHeight) {
      break;
    }
  }

  // ── Step 5: Restore page state ───────────────────────────────
  status('Restoring page…');
  await sendToContent(tabId, { action: 'RESTORE_FIXED' });
  await sendToContent(tabId, { action: 'RESTORE_SCROLL' });
  progress(88);

  // ── Step 6: Load all strip images ────────────────────────────
  status('Loading captured sections…');
  const imageBitmaps = await Promise.all(
    strips.map((s) => dataUrlToImageBitmap(s.dataUrl))
  );
  progress(92);

  // ── Step 7: Stitch on OffscreenCanvas ────────────────────────
  status('Stitching image…');

  // The captured images are at physical pixel resolution (CSS × DPR)
  const physicalViewportW = Math.round(viewportWidth  * dpr);
  const physicalViewportH = Math.round(viewportHeight * dpr);
  const physicalFullH     = Math.round(effectiveHeight * dpr);

  // Create canvas at physical resolution
  const canvas = new OffscreenCanvas(physicalViewportW, physicalFullH);
  const ctx    = canvas.getContext('2d');

  for (let i = 0; i < strips.length; i++) {
    const strip  = strips[i];
    const bitmap = imageBitmaps[i];

    // The Y position on the final canvas (physical pixels)
    const destY = Math.round(strip.scrollY * dpr);

    // How many pixels of the strip are actually new content.
    // The strip captures viewportH worth of content starting at scrollY.
    // If the last strip goes past effectiveHeight, crop it.
    const stripContentH = Math.min(
      physicalViewportH,
      physicalFullH - destY
    );

    if (stripContentH <= 0) break;

    ctx.drawImage(
      bitmap,
      0, 0, bitmap.width, stripContentH,   // source: full width, cropped height
      0, destY, physicalViewportW, stripContentH // dest: positioned at scrollY
    );

    // Release memory
    bitmap.close();
  }

  progress(97);

  // ── Step 8: Export to PNG ────────────────────────────────────
  status('Exporting PNG…');
  const blob    = await canvas.convertToBlob({ type: 'image/png' });
  const reader  = new FileReaderSync();           // Available in service workers
  const dataUrl = reader.readAsDataURL(blob);

  progress(100);
  status('Done!');

  return {
    dataUrl,
    width:  viewportWidth,
    height: effectiveHeight,
    fileSize: blob.size,
  };
}
