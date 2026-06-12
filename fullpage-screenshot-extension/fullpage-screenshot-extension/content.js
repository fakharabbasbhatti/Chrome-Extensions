/**
 * content.js
 * Injected into the target page by the background service worker.
 * Responsible for:
 *   1. Reporting full page dimensions.
 *   2. Scrolling to specific positions on request.
 *   3. Hiding fixed/sticky elements during capture (optional enhancement).
 *   4. Restoring page state after capture.
 */

(function () {
  'use strict';

  // ── State tracking ───────────────────────────────────────────
  let _originalScrollX = 0;
  let _originalScrollY = 0;
  let _hiddenFixedElements = [];

  /**
   * Returns full page dimensions and viewport size.
   */
  function getPageDimensions() {
    const body = document.body;
    const html = document.documentElement;

    const fullWidth = Math.max(
      body.scrollWidth, body.offsetWidth,
      html.clientWidth, html.scrollWidth, html.offsetWidth
    );

    const fullHeight = Math.max(
      body.scrollHeight, body.offsetHeight,
      html.clientHeight, html.scrollHeight, html.offsetHeight
    );

    return {
      fullWidth,
      fullHeight,
      viewportWidth:  window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };
  }

  /**
   * Scrolls the page to the given (x, y) position and waits for any
   * lazy-loaded content / scroll-triggered animations to settle.
   * @param {number} x
   * @param {number} y
   * @param {number} [delay=150] - ms to wait after scrolling
   */
  async function scrollTo(x, y, delay = 150) {
    window.scrollTo(x, y);
    await new Promise((resolve) => setTimeout(resolve, delay));
    // Confirm final scroll position (page might cap scrollY)
    return {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };
  }

  /**
   * Saves current scroll position so we can restore it after capture.
   */
  function saveScrollPosition() {
    _originalScrollX = window.scrollX;
    _originalScrollY = window.scrollY;
  }

  /**
   * Restores the scroll position saved before capture began.
   */
  function restoreScrollPosition() {
    window.scrollTo(_originalScrollX, _originalScrollY);
  }

  /**
   * Hides fixed and sticky elements so they don't appear duplicated
   * across stitched capture strips.
   */
  function hideFixedElements() {
    _hiddenFixedElements = [];
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'sticky') {
        _hiddenFixedElements.push({ el, visibility: el.style.visibility });
        el.style.visibility = 'hidden';
      }
    }
  }

  /**
   * Restores visibility of all elements that were hidden during capture.
   */
  function restoreFixedElements() {
    for (const { el, visibility } of _hiddenFixedElements) {
      el.style.visibility = visibility;
    }
    _hiddenFixedElements = [];
  }

  // ── Message listener ─────────────────────────────────────────
  // The background script communicates with this content script
  // via chrome.tabs.sendMessage / chrome.runtime.sendMessage.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      switch (message.action) {

        case 'GET_PAGE_DIMENSIONS': {
          sendResponse({ success: true, data: getPageDimensions() });
          break;
        }

        case 'SCROLL_TO': {
          const pos = await scrollTo(message.x, message.y, message.delay ?? 150);
          sendResponse({ success: true, data: pos });
          break;
        }

        case 'SAVE_SCROLL': {
          saveScrollPosition();
          sendResponse({ success: true });
          break;
        }

        case 'RESTORE_SCROLL': {
          restoreScrollPosition();
          sendResponse({ success: true });
          break;
        }

        case 'HIDE_FIXED': {
          hideFixedElements();
          sendResponse({ success: true, count: _hiddenFixedElements.length });
          break;
        }

        case 'RESTORE_FIXED': {
          restoreFixedElements();
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ success: false, error: `Unknown action: ${message.action}` });
      }
    })();

    // Keep the message channel open for async sendResponse
    return true;
  });
})();
