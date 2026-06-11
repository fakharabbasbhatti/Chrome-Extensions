/**
 * background.js — Service Worker for Advanced Color Picker Pro
 *
 * Responsibilities:
 *   • Install / update lifecycle
 *   • Message bus between popup ↔ content script
 *   • Badge updates reflecting picked-color state
 *   • Storage helpers invoked from both popup and content script
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  HISTORY:    'colorHistory',
  FAVORITES:  'colorFavorites',
  SETTINGS:   'colorPickerSettings',
};

const MAX_HISTORY = 50; // cap to avoid unbounded storage growth

// ─── Install / Update ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    // Seed default settings on first install
    await chrome.storage.local.set({
      [STORAGE_KEYS.HISTORY]:   [],
      [STORAGE_KEYS.FAVORITES]: [],
      [STORAGE_KEYS.SETTINGS]:  {
        theme:          'auto',   // 'light' | 'dark' | 'auto'
        defaultFormat:  'hex',
        showNotifications: true,
      },
    });
    console.log('[ColorPicker] Extension installed — storage initialised.');
  }
});

// ─── Message Dispatcher ──────────────────────────────────────────────────────

/**
 * Central message handler.
 * All async handlers must return `true` from the synchronous listener body
 * so that Chrome keeps the message channel open.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {

    // ── History ────────────────────────────────────────────────────────────
    case 'ADD_TO_HISTORY':
      handleAddToHistory(payload).then(sendResponse).catch(err => {
        console.error('[ColorPicker] ADD_TO_HISTORY error:', err);
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'GET_HISTORY':
      getHistory().then(sendResponse).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'CLEAR_HISTORY':
      clearHistory().then(sendResponse).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    // ── Favorites ──────────────────────────────────────────────────────────
    case 'ADD_TO_FAVORITES':
      handleAddToFavorites(payload).then(sendResponse).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'REMOVE_FROM_FAVORITES':
      handleRemoveFromFavorites(payload).then(sendResponse).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'GET_FAVORITES':
      getFavorites().then(sendResponse).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    // ── Badge ──────────────────────────────────────────────────────────────
    case 'SET_BADGE':
      setBadge(payload).then(sendResponse).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    // ── Settings ───────────────────────────────────────────────────────────
    case 'GET_SETTINGS':
      getSettings().then(sendResponse).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'SAVE_SETTINGS':
      saveSettings(payload).then(sendResponse).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    // ── Export / Import ────────────────────────────────────────────────────
    case 'EXPORT_COLORS':
      exportColors().then(sendResponse).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'IMPORT_COLORS':
      importColors(payload).then(sendResponse).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    default:
      sendResponse({ success: false, error: `Unknown message type: ${type}` });
      return false;
  }
});

// ─── History Handlers ─────────────────────────────────────────────────────────

async function getHistory() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
  return { success: true, data: result[STORAGE_KEYS.HISTORY] || [] };
}

async function handleAddToHistory(colorEntry) {
  if (!colorEntry || !colorEntry.hex) {
    return { success: false, error: 'Invalid color entry' };
  }

  const result = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
  let history = result[STORAGE_KEYS.HISTORY] || [];

  // Deduplicate: remove any existing entry with the same hex
  history = history.filter(c => c.hex !== colorEntry.hex);

  // Prepend newest entry
  history.unshift({
    hex:       colorEntry.hex,
    rgb:       colorEntry.rgb,
    rgba:      colorEntry.rgba,
    hsl:       colorEntry.hsl,
    hsv:       colorEntry.hsv,
    timestamp: Date.now(),
  });

  // Trim to max length
  if (history.length > MAX_HISTORY) {
    history = history.slice(0, MAX_HISTORY);
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: history });
  return { success: true, data: history };
}

async function clearHistory() {
  await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: [] });
  return { success: true };
}

// ─── Favorites Handlers ───────────────────────────────────────────────────────

async function getFavorites() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.FAVORITES);
  return { success: true, data: result[STORAGE_KEYS.FAVORITES] || [] };
}

async function handleAddToFavorites(colorEntry) {
  if (!colorEntry || !colorEntry.hex) {
    return { success: false, error: 'Invalid color entry' };
  }

  const result = await chrome.storage.local.get(STORAGE_KEYS.FAVORITES);
  const favorites = result[STORAGE_KEYS.FAVORITES] || [];

  // Prevent duplicates
  if (favorites.some(c => c.hex === colorEntry.hex)) {
    return { success: true, data: favorites, alreadyExists: true };
  }

  favorites.unshift({ ...colorEntry, savedAt: Date.now() });
  await chrome.storage.local.set({ [STORAGE_KEYS.FAVORITES]: favorites });
  return { success: true, data: favorites };
}

async function handleRemoveFromFavorites({ hex }) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.FAVORITES);
  const favorites = (result[STORAGE_KEYS.FAVORITES] || []).filter(c => c.hex !== hex);
  await chrome.storage.local.set({ [STORAGE_KEYS.FAVORITES]: favorites });
  return { success: true, data: favorites };
}

// ─── Badge Helpers ────────────────────────────────────────────────────────────

async function setBadge({ color, text = '' }) {
  // color is a CSS hex string like '#ff0000'
  const tabId = await getActiveTabId();
  if (!tabId) return { success: false, error: 'No active tab' };

  await chrome.action.setBadgeText({ text, tabId });
  if (color) {
    await chrome.action.setBadgeBackgroundColor({ color, tabId });
  }
  return { success: true };
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ? tab.id : null;
}

// ─── Settings Handlers ────────────────────────────────────────────────────────

async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { success: true, data: result[STORAGE_KEYS.SETTINGS] || {} };
}

async function saveSettings(newSettings) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const merged = { ...(result[STORAGE_KEYS.SETTINGS] || {}), ...newSettings };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged });
  return { success: true, data: merged };
}

// ─── Export / Import ──────────────────────────────────────────────────────────

async function exportColors() {
  const [historyResult, favoritesResult] = await Promise.all([
    chrome.storage.local.get(STORAGE_KEYS.HISTORY),
    chrome.storage.local.get(STORAGE_KEYS.FAVORITES),
  ]);

  const exportData = {
    exportedAt:  new Date().toISOString(),
    version:     '1.0.0',
    history:     historyResult[STORAGE_KEYS.HISTORY]   || [],
    favorites:   favoritesResult[STORAGE_KEYS.FAVORITES] || [],
  };

  return { success: true, data: JSON.stringify(exportData, null, 2) };
}

async function importColors({ jsonString }) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { success: false, error: 'Invalid JSON string' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { success: false, error: 'Malformed import data' };
  }

  const updates = {};

  if (Array.isArray(parsed.history)) {
    updates[STORAGE_KEYS.HISTORY] = parsed.history.slice(0, MAX_HISTORY);
  }

  if (Array.isArray(parsed.favorites)) {
    updates[STORAGE_KEYS.FAVORITES] = parsed.favorites;
  }

  await chrome.storage.local.set(updates);
  return { success: true };
}
