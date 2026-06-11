/**
 * content.js — Content Script for Advanced Color Picker Pro
 *
 * Injected into every page. Provides:
 *   • EyeDropper API bridge (popup triggers, content script opens the native picker)
 *   • Coordination message handlers
 *
 * The EyeDropper API must be invoked from a user-gesture context inside a
 * visible page (not a popup background). We open the dropper here in response
 * to a message from the popup.
 */

'use strict';

// Prevent double-injection if the script is somehow run twice
if (window.__colorPickerProInjected) {
  // already initialised — skip
} else {
  window.__colorPickerProInjected = true;

  // ─── EyeDropper Bridge ──────────────────────────────────────────────────────

  /**
   * Activate the native EyeDropper.
   * Resolves with { success: true, sRGBHex } or { success: false, error }.
   */
  async function activateEyeDropper() {
    if (!window.EyeDropper) {
      return { success: false, error: 'EyeDropper API not supported in this browser.' };
    }

    try {
      const dropper = new window.EyeDropper();
      const result = await dropper.open();  // Resolves when the user picks a colour
      return { success: true, sRGBHex: result.sRGBHex };
    } catch (err) {
      // User pressed Escape — treat as cancellation, not an error
      if (err.name === 'AbortError') {
        return { success: false, cancelled: true };
      }
      return { success: false, error: err.message };
    }
  }

  // ─── Message Listener ───────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'ACTIVATE_EYEDROPPER') {
      activateEyeDropper()
        .then(sendResponse)
        .catch(err => sendResponse({ success: false, error: err.message }));

      // Return true to keep the message channel open for the async response
      return true;
    }

    if (message.type === 'PING') {
      sendResponse({ success: true, ready: true });
      return false;
    }
  });

  // ─── Keyboard Shortcut ─────────────────────────────────────────────────────
  // Alt+Shift+C opens the dropper directly from the page without the popup.

  document.addEventListener('keydown', async (e) => {
    if (e.altKey && e.shiftKey && e.key === 'C') {
      const result = await activateEyeDropper();
      if (result.success) {
        // Save picked colour via background service worker
        chrome.runtime.sendMessage({
          type: 'ADD_TO_HISTORY',
          payload: buildMinimalEntry(result.sRGBHex),
        });

        // Show a brief on-page toast
        showToast(`Colour picked: ${result.sRGBHex}`);
      }
    }
  });

  // ─── Minimal Color Entry Builder ────────────────────────────────────────────

  /**
   * Build a storage-ready entry from a hex string without importing the full
   * color-picker.js library (to keep the content script lean).
   * @param {string} hex e.g. '#1a2b3c'
   * @returns {object}
   */
  function buildMinimalEntry(hex) {
    // Parse hex into r,g,b
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);

    // Basic HSL conversion
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    let s = 0, hDeg = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rn: hDeg = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60; break;
        case gn: hDeg = ((bn - rn) / d + 2) * 60; break;
        default:  hDeg = ((rn - gn) / d + 4) * 60;
      }
    }

    return {
      hex,
      rgb:  `rgb(${r}, ${g}, ${b})`,
      rgba: `rgba(${r}, ${g}, ${b}, 1)`,
      hsl:  `hsl(${hDeg.toFixed(1)}, ${(s * 100).toFixed(1)}%, ${(l * 100).toFixed(1)}%)`,
      hsv:  '',
    };
  }

  // ─── On-Page Toast Notification ─────────────────────────────────────────────

  /**
   * Show a brief floating toast on the page.
   * @param {string} msg
   */
  function showToast(msg) {
    const existing = document.getElementById('__cp-pro-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = '__cp-pro-toast';
    toast.textContent = msg;

    Object.assign(toast.style, {
      position:        'fixed',
      bottom:          '24px',
      left:            '50%',
      transform:       'translateX(-50%)',
      background:      '#1e1e2e',
      color:           '#cdd6f4',
      padding:         '10px 20px',
      borderRadius:    '8px',
      fontSize:        '13px',
      fontFamily:      'system-ui, sans-serif',
      boxShadow:       '0 4px 20px rgba(0,0,0,.4)',
      zIndex:          '2147483647',
      opacity:         '0',
      transition:      'opacity .2s ease',
      pointerEvents:   'none',
      maxWidth:        '320px',
      textAlign:       'center',
    });

    document.body.appendChild(toast);

    // Fade in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { toast.style.opacity = '1'; });
    });

    // Fade out after 2.5 s
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 2500);
  }
}
