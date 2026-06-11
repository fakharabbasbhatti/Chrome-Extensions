/**
 * popup.js — Popup Controller for Advanced Color Picker Pro
 *
 * Manages:
 *   • EyeDropper activation (delegated to content script)
 *   • Color format display and live HEX input
 *   • Clipboard copy
 *   • History and Favorites rendering
 *   • Export / Import JSON
 *   • Dark mode application
 */

'use strict';

// ─── DOM References ────────────────────────────────────────────────────────────

const Dom = {
  colorPreview:   () => document.getElementById('color-preview'),
  previewLabel:   () => document.getElementById('preview-label'),
  hexInput:       () => document.getElementById('hex-input'),
  formatValue:    () => document.getElementById('format-value'),
  copyIcon:       () => document.getElementById('copy-icon'),
  checkIcon:      () => document.getElementById('check-icon'),
  btnEyedropper:  () => document.getElementById('btn-eyedropper'),
  btnCopy:        () => document.getElementById('btn-copy'),
  btnAddFavorite: () => document.getElementById('btn-add-favorite'),
  btnClearHistory:() => document.getElementById('btn-clear-history'),
  btnExport:      () => document.getElementById('btn-export'),
  btnImport:      () => document.getElementById('btn-import'),
  btnOptions:     () => document.getElementById('btn-options'),
  importFileInput:() => document.getElementById('import-file-input'),
  toast:          () => document.getElementById('toast'),
  historyGrid:    () => document.getElementById('history-grid'),
  historyEmpty:   () => document.getElementById('history-empty'),
  favoritesGrid:  () => document.getElementById('favorites-grid'),
  favoritesEmpty: () => document.getElementById('favorites-empty'),
  formatTabs:     () => document.querySelectorAll('.format-tab'),
  paletteTabs:    () => document.querySelectorAll('.palette-tab'),
  palettePanels:  () => document.querySelectorAll('.palette-panel'),
};

// ─── State ─────────────────────────────────────────────────────────────────────

let state = {
  currentColor: null,   // { hex, rgb, rgba, hsl, hsv }
  activeFormat: 'hex',
  history:   [],
  favorites: [],
  settings:  {},
};

// ─── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  applyTheme();
  await Promise.all([loadHistory(), loadFavorites()]);
  bindEvents();

  // Restore last picked color from history if available
  if (state.history.length > 0) {
    setCurrentColor(state.history[0]);
  } else {
    setCurrentColor(ColorUtils.formatsFrom(ColorUtils.hexToRgba('#6c63ff')));
  }
});

// ─── Settings & Theme ─────────────────────────────────────────────────────────

async function loadSettings() {
  const res = await sendMessage({ type: 'GET_SETTINGS' });
  if (res.success) {
    state.settings = res.data;
    state.activeFormat = res.data.defaultFormat || 'hex';
  }
}

function applyTheme() {
  const theme = state.settings.theme || 'auto';
  document.documentElement.classList.remove('dark', 'light');
  if (theme === 'dark') document.documentElement.classList.add('dark');
  else if (theme === 'light') document.documentElement.classList.add('light');
  // 'auto' → CSS prefers-color-scheme media query handles it
}

// ─── Data Loaders ──────────────────────────────────────────────────────────────

async function loadHistory() {
  const res = await sendMessage({ type: 'GET_HISTORY' });
  if (res.success) {
    state.history = res.data;
    renderPalette(state.history, Dom.historyGrid(), Dom.historyEmpty());
  }
}

async function loadFavorites() {
  const res = await sendMessage({ type: 'GET_FAVORITES' });
  if (res.success) {
    state.favorites = res.data;
    renderPalette(state.favorites, Dom.favoritesGrid(), Dom.favoritesEmpty());
  }
}

// ─── Current Color ─────────────────────────────────────────────────────────────

/**
 * Set the active color across all UI elements.
 * @param {{ hex:string, rgb:string, rgba:string, hsl:string, hsv:string }} formats
 */
function setCurrentColor(formats) {
  state.currentColor = formats;

  // Preview swatch
  const rgba = ColorUtils.hexToRgba(formats.hex);
  const previewEl = Dom.colorPreview();
  previewEl.style.background = formats.rgba || formats.hex;

  // Label colour — ensure readable contrast
  const textColor = rgba ? ColorUtils.contrastText(rgba.r, rgba.g, rgba.b) : '#ffffff';
  Dom.previewLabel().style.color = textColor;
  Dom.previewLabel().textContent = formats.hex.toUpperCase();

  // Hex input
  Dom.hexInput().value = formats.hex.toUpperCase();

  // Active format value
  updateFormatDisplay();

  // Update active format tab
  Dom.formatTabs().forEach(t => {
    t.classList.toggle('active', t.dataset.format === state.activeFormat);
    t.setAttribute('aria-selected', t.dataset.format === state.activeFormat);
  });
}

/**
 * Update the read-only format-value field from current color + active format.
 */
function updateFormatDisplay() {
  if (!state.currentColor) return;
  const val = state.currentColor[state.activeFormat] || state.currentColor.hex;
  Dom.formatValue().value = val;
}

// ─── Palette Rendering ─────────────────────────────────────────────────────────

/**
 * Render a list of color entries as swatches into a grid container.
 * @param {Array} colors
 * @param {HTMLElement} grid
 * @param {HTMLElement} emptyEl
 */
function renderPalette(colors, grid, emptyEl) {
  grid.innerHTML = '';

  if (!colors || colors.length === 0) {
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');

  colors.forEach((color) => {
    const swatch = document.createElement('button');
    swatch.className = 'swatch';
    swatch.style.background = color.rgba || color.hex;
    swatch.setAttribute('title', color.hex);
    swatch.setAttribute('aria-label', `Select color ${color.hex}`);
    swatch.tabIndex = 0;

    swatch.addEventListener('click', () => {
      setCurrentColor(color);
    });

    // Right-click context menu: remove from this list
    swatch.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      handleSwatchRemove(color, grid, emptyEl);
    });

    grid.appendChild(swatch);
  });
}

async function handleSwatchRemove(color, grid, emptyEl) {
  const isFav = emptyEl.id === 'favorites-empty';
  if (isFav) {
    const res = await sendMessage({ type: 'REMOVE_FROM_FAVORITES', payload: { hex: color.hex } });
    if (res.success) {
      state.favorites = res.data;
      renderPalette(state.favorites, Dom.favoritesGrid(), Dom.favoritesEmpty());
      showToast('Removed from favorites');
    }
  } else {
    // Remove from local history (no explicit background message needed; we update locally and persist)
    state.history = state.history.filter(c => c.hex !== color.hex);
    await sendMessage({ type: 'CLEAR_HISTORY' });
    // Re-add remaining entries in bulk by importing
    for (const c of [...state.history].reverse()) {
      await sendMessage({ type: 'ADD_TO_HISTORY', payload: c });
    }
    renderPalette(state.history, Dom.historyGrid(), Dom.historyEmpty());
    showToast('Removed from history');
  }
}

// ─── Event Bindings ────────────────────────────────────────────────────────────

function bindEvents() {

  // ── EyeDropper ────────────────────────────────────────────
  Dom.btnEyedropper().addEventListener('click', handleEyeDropper);

  // ── HEX input live update ─────────────────────────────────
  Dom.hexInput().addEventListener('input', handleHexInput);
  Dom.hexInput().addEventListener('keydown', (e) => {
    if (e.key === 'Enter') Dom.hexInput().blur();
  });

  // ── Format tabs ───────────────────────────────────────────
  Dom.formatTabs().forEach(tab => {
    tab.addEventListener('click', () => {
      state.activeFormat = tab.dataset.format;
      updateFormatDisplay();
      Dom.formatTabs().forEach(t => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab);
      });
      // Persist preference
      sendMessage({ type: 'SAVE_SETTINGS', payload: { defaultFormat: state.activeFormat } });
    });
  });

  // ── Copy button ───────────────────────────────────────────
  Dom.btnCopy().addEventListener('click', handleCopy);

  // ── Add to favorites ──────────────────────────────────────
  Dom.btnAddFavorite().addEventListener('click', handleAddFavorite);

  // ── Palette tabs ──────────────────────────────────────────
  Dom.paletteTabs().forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.ptab;
      Dom.paletteTabs().forEach(t => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab);
      });
      Dom.palettePanels().forEach(p => {
        p.classList.toggle('active', p.id === `panel-${target}`);
      });
    });
  });

  // ── Clear history ─────────────────────────────────────────
  Dom.btnClearHistory().addEventListener('click', async () => {
    const res = await sendMessage({ type: 'CLEAR_HISTORY' });
    if (res.success) {
      state.history = [];
      renderPalette([], Dom.historyGrid(), Dom.historyEmpty());
      showToast('History cleared');
    }
  });

  // ── Export ────────────────────────────────────────────────
  Dom.btnExport().addEventListener('click', handleExport);

  // ── Import ────────────────────────────────────────────────
  Dom.btnImport().addEventListener('click', () => Dom.importFileInput().click());
  Dom.importFileInput().addEventListener('change', handleImport);

  // ── Options ───────────────────────────────────────────────
  Dom.btnOptions().addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

// ─── EyeDropper Handler ────────────────────────────────────────────────────────

async function handleEyeDropper() {
  const btn = Dom.btnEyedropper();
  btn.classList.add('active');
  btn.disabled = true;

  try {
    // First ensure the content script is ready
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      showToast('No active tab found', 'error');
      return;
    }

    // Check for restricted URLs (chrome://, about:, etc.)
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:') ||
        tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://')) {
      showToast('Cannot pick from this page. Try a regular webpage.', 'error');
      return;
    }

    // Ping the content script to verify injection
    let pingOk = false;
    try {
      const ping = await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
      pingOk = ping && ping.ready;
    } catch {
      // Content script not yet injected — inject it now
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        pingOk = true;
      } catch (injectErr) {
        showToast('Cannot access this page', 'error');
        return;
      }
    }

    if (!pingOk) {
      showToast('Content script not ready. Reload the page and try again.', 'error');
      return;
    }

    // Delegate EyeDropper to content script (needs user-gesture context in page)
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'ACTIVATE_EYEDROPPER' });

    if (result.cancelled) {
      showToast('Cancelled');
      return;
    }

    if (!result.success) {
      showToast(result.error || 'EyeDropper failed', 'error');
      return;
    }

    // Build full color object from returned hex
    const rgba = ColorUtils.hexToRgba(result.sRGBHex);
    if (!rgba) {
      showToast('Could not parse picked color', 'error');
      return;
    }

    const formats = ColorUtils.formatsFrom(rgba);
    setCurrentColor(formats);

    // Persist to history
    const addRes = await sendMessage({ type: 'ADD_TO_HISTORY', payload: formats });
    if (addRes.success) {
      state.history = addRes.data;
      renderPalette(state.history, Dom.historyGrid(), Dom.historyEmpty());
    }

    // Update extension badge
    sendMessage({ type: 'SET_BADGE', payload: { color: formats.hex, text: '' } });

    showToast(`Picked ${formats.hex.toUpperCase()}`, 'success');

  } catch (err) {
    showToast(err.message || 'Unexpected error', 'error');
    console.error('[ColorPicker] EyeDropper error:', err);
  } finally {
    btn.classList.remove('active');
    btn.disabled = false;
  }
}

// ─── HEX Input Handler ─────────────────────────────────────────────────────────

function handleHexInput(e) {
  let val = e.target.value.trim();
  if (!val.startsWith('#')) val = '#' + val;

  if (!ColorUtils.isValidHex(val)) return; // Wait for a complete valid hex

  const rgba = ColorUtils.hexToRgba(val);
  if (!rgba) return;

  const formats = ColorUtils.formatsFrom(rgba);
  setCurrentColor(formats);
}

// ─── Copy Handler ──────────────────────────────────────────────────────────────

async function handleCopy() {
  if (!state.currentColor) return;
  const val = state.currentColor[state.activeFormat] || state.currentColor.hex;

  try {
    await navigator.clipboard.writeText(val);
    // Swap icons temporarily
    Dom.copyIcon().classList.add('hidden');
    Dom.checkIcon().classList.remove('hidden');
    setTimeout(() => {
      Dom.copyIcon().classList.remove('hidden');
      Dom.checkIcon().classList.add('hidden');
    }, 1500);
    showToast(`Copied: ${val}`, 'success');
  } catch (err) {
    // Fallback for restricted environments
    const ta = document.createElement('textarea');
    ta.value = val;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast(`Copied: ${val}`, 'success');
  }
}

// ─── Favorites Handler ─────────────────────────────────────────────────────────

async function handleAddFavorite() {
  if (!state.currentColor) return;

  const res = await sendMessage({ type: 'ADD_TO_FAVORITES', payload: state.currentColor });
  if (res.success) {
    if (res.alreadyExists) {
      showToast('Already in favorites');
      return;
    }
    state.favorites = res.data;
    renderPalette(state.favorites, Dom.favoritesGrid(), Dom.favoritesEmpty());
    showToast('Added to favorites ⭐', 'success');
  }
}

// ─── Export Handler ────────────────────────────────────────────────────────────

async function handleExport() {
  const res = await sendMessage({ type: 'EXPORT_COLORS' });
  if (!res.success) {
    showToast('Export failed', 'error');
    return;
  }

  const blob = new Blob([res.data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `color-picker-export-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Colors exported', 'success');
}

// ─── Import Handler ────────────────────────────────────────────────────────────

async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  // Reset the input so the same file can be re-imported
  Dom.importFileInput().value = '';

  const reader = new FileReader();
  reader.onload = async (ev) => {
    const jsonString = ev.target.result;
    const res = await sendMessage({ type: 'IMPORT_COLORS', payload: { jsonString } });
    if (res.success) {
      showToast('Colors imported successfully', 'success');
      await loadHistory();
      await loadFavorites();
    } else {
      showToast(res.error || 'Import failed', 'error');
    }
  };
  reader.onerror = () => showToast('Could not read file', 'error');
  reader.readAsText(file);
}

// ─── Toast ─────────────────────────────────────────────────────────────────────

let toastTimer = null;

/**
 * Show a transient toast message.
 * @param {string} message
 * @param {'success'|'error'|''} type
 */
function showToast(message, type = '') {
  const toast = Dom.toast();
  toast.textContent = message;
  toast.className = `toast show${type ? ' ' + type : ''}`;

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

// ─── Messaging Helper ──────────────────────────────────────────────────────────

/**
 * Send a message to the background service worker and await the response.
 * @param {{ type: string, payload?: any }} message
 * @returns {Promise<any>}
 */
function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { success: false, error: 'No response' });
      }
    });
  });
}
