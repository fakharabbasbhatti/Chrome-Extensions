/**
 * popup.js
 * Controls the popup UI.
 *
 * Panel states:
 *   capture  → initial state with "Capture" button
 *   loading  → during active capture (progress bar + status text)
 *   preview  → after capture succeeds (thumbnail + download)
 *   error    → on capture failure
 */

'use strict';

// ── DOM refs ──────────────────────────────────────────────────
const panelCapture  = document.getElementById('panel-capture');
const panelLoading  = document.getElementById('panel-loading');
const panelPreview  = document.getElementById('panel-preview');
const panelError    = document.getElementById('panel-error');

const btnCapture    = document.getElementById('btn-capture');
const btnDownload   = document.getElementById('btn-download');
const btnRecapture  = document.getElementById('btn-recapture');
const btnRetry      = document.getElementById('btn-retry');

const loadingText   = document.getElementById('loading-text');
const progressFill  = document.getElementById('progress-fill');
const progressLabel = document.getElementById('progress-label');
const previewImg    = document.getElementById('preview-img');
const metaText      = document.getElementById('meta-text');
const errorMsg      = document.getElementById('error-msg');

// ── Panel management ──────────────────────────────────────────

const PANELS = { capture: panelCapture, loading: panelLoading, preview: panelPreview, error: panelError };

/**
 * Shows a single panel and hides the rest.
 * @param {'capture'|'loading'|'preview'|'error'} name
 */
function showPanel(name) {
  for (const [key, el] of Object.entries(PANELS)) {
    el.classList.toggle('hidden', key !== name);
  }
}

// ── Progress updates ──────────────────────────────────────────

function setProgress(percent, statusText) {
  const clamped = Math.max(0, Math.min(100, percent));
  progressFill.style.width  = `${clamped}%`;
  progressLabel.textContent = `${clamped}%`;
  if (statusText) loadingText.textContent = statusText;
}

// ── Capture flow ──────────────────────────────────────────────

/**
 * Formats bytes into a human-readable string.
 */
function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

/**
 * Initiates a full-page capture by sending a message to the background worker.
 */
function startCapture() {
  // Reset progress
  setProgress(0, 'Starting capture…');
  showPanel('loading');

  chrome.runtime.sendMessage({ type: 'START_CAPTURE' }, (response) => {
    if (chrome.runtime.lastError) {
      showError('Failed to start capture: ' + chrome.runtime.lastError.message);
    }
  });
}

/**
 * Shows the error panel with a friendly message.
 */
function showError(message) {
  errorMsg.textContent = message || 'An unexpected error occurred.';
  showPanel('error');
}

/**
 * Shows the preview panel with the captured image.
 * @param {number} width
 * @param {number} height
 * @param {number} fileSize
 * @param {string} [dataUrl] - if provided, used directly for the preview image
 */
async function showPreview(width, height, fileSize, dataUrl) {
  if (dataUrl) {
    previewImg.src = dataUrl;
  } else {
    // Fallback: ask background for the latest screenshot (e.g. on popup re-open)
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_LATEST_SCREENSHOT' });
      if (res && res.screenshot) {
        previewImg.src = res.screenshot.dataUrl;
      }
    } catch (_) { /* Preview is non-critical */ }
  }

  // Build meta string: dimensions + file size
  const parts = [`${width} × ${height}px`];
  if (fileSize) parts.push(formatBytes(fileSize));
  metaText.textContent = parts.join('  ·  ');

  showPanel('preview');
}

// ── Message listener ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {

    case 'CAPTURE_PROGRESS':
      if (panelLoading.classList.contains('hidden')) break; // Guard stale messages
      setProgress(message.percent, message.status);
      break;

    case 'CAPTURE_DONE':
      showPreview(message.width, message.height, message.fileSize, message.dataUrl);
      break;

    case 'CAPTURE_ERROR':
      showError(message.message);
      break;

    case 'DOWNLOAD_STARTED':
      clearTimeout(window.__downloadTimeout);
      // Briefly show feedback on the download button
      btnDownload.textContent = '✓ Saved!';
      btnDownload.disabled = true;
      setTimeout(() => {
        btnDownload.innerHTML = `
          <svg class="btn__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7,10 12,15 17,10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg> Download PNG`;
        btnDownload.disabled = false;
      }, 2000);
      break;

    case 'DOWNLOAD_ERROR':
      clearTimeout(window.__downloadTimeout);
      btnDownload.disabled = false;
      btnDownload.innerHTML = `
        <svg class="btn__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7,10 12,15 17,10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg> Download PNG`;
      showError(message.message || 'Download failed. Please try again.');
      break;
  }
});

// ── Button handlers ───────────────────────────────────────────

btnCapture.addEventListener('click', () => {
  btnCapture.disabled = true;
  startCapture();
  // Re-enable in case of very fast error (safety)
  setTimeout(() => { btnCapture.disabled = false; }, 500);
});

btnDownload.addEventListener('click', () => {
  btnDownload.disabled = true;
  btnDownload.textContent = 'Downloading…';
  chrome.runtime.sendMessage({ type: 'DOWNLOAD_SCREENSHOT' });

  // Safety fallback: if no response arrives within 5s, re-enable the button
  // so the user isn't stuck on a frozen "Downloading…" state.
  clearTimeout(window.__downloadTimeout);
  window.__downloadTimeout = setTimeout(() => {
    if (btnDownload.disabled && btnDownload.textContent.includes('Downloading')) {
      showError('Download did not complete. Right-click the preview image and choose "Save image as…" instead, or try again.');
    }
  }, 6000);
});

btnRecapture.addEventListener('click', () => {
  showPanel('capture');
  btnCapture.disabled = false;
});

btnRetry.addEventListener('click', () => {
  showPanel('capture');
  btnCapture.disabled = false;
});

// ── Init ──────────────────────────────────────────────────────

// On popup open, if a recent screenshot exists, show preview immediately
(async function init() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_LATEST_SCREENSHOT' });
    if (res && res.screenshot) {
      const { width, height, fileSize, dataUrl } = res.screenshot;
      showPreview(width, height, fileSize, dataUrl);
      return;
    }
  } catch (_) { /* Start fresh */ }

  showPanel('capture');
})();
