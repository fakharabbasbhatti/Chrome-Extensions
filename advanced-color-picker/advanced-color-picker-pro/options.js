/**
 * options.js — Options Page Controller for Advanced Color Picker Pro
 */

'use strict';

// ─── State ─────────────────────────────────────────────────────────────────────

let settings = {};

// ─── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  applyTheme();
  populateUI();
  bindEvents();
});

// ─── Settings I/O ─────────────────────────────────────────────────────────────

async function loadSettings() {
  const res = await sendMessage({ type: 'GET_SETTINGS' });
  if (res.success) settings = res.data || {};
}

async function persistSettings(partial) {
  const res = await sendMessage({ type: 'SAVE_SETTINGS', payload: partial });
  if (res.success) {
    settings = res.data;
    showToast('Settings saved', 'success');
  } else {
    showToast('Failed to save settings', 'error');
  }
}

// ─── Theme ────────────────────────────────────────────────────────────────────

function applyTheme() {
  const theme = settings.theme || 'auto';
  document.documentElement.classList.remove('dark', 'light');
  if (theme === 'dark')  document.documentElement.classList.add('dark');
  if (theme === 'light') document.documentElement.classList.add('light');
}

// ─── Populate UI ──────────────────────────────────────────────────────────────

function populateUI() {
  // Theme cards
  const theme = settings.theme || 'auto';
  document.querySelectorAll('.theme-card').forEach(card => {
    const isActive = card.dataset.theme === theme;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-checked', isActive);
  });

  // Default format
  const fmtSelect = document.getElementById('default-format');
  if (fmtSelect) fmtSelect.value = settings.defaultFormat || 'hex';

  // Notifications toggle
  const notifToggle = document.getElementById('toggle-notifications');
  if (notifToggle) notifToggle.checked = settings.showNotifications !== false;
}

// ─── Event Bindings ────────────────────────────────────────────────────────────

function bindEvents() {

  // ── Sidebar Navigation ────────────────────────────────────
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const target = item.dataset.section;

      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      document.querySelectorAll('.section').forEach(s => {
        s.classList.toggle('active', s.id === `section-${target}`);
      });
    });
  });

  // ── Theme Cards ───────────────────────────────────────────
  document.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => {
      const theme = card.dataset.theme;

      document.querySelectorAll('.theme-card').forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-checked', 'false');
      });
      card.classList.add('active');
      card.setAttribute('aria-checked', 'true');

      // Apply immediately to this page
      document.documentElement.classList.remove('dark', 'light');
      if (theme === 'dark')  document.documentElement.classList.add('dark');
      if (theme === 'light') document.documentElement.classList.add('light');

      persistSettings({ theme });
    });
  });

  // ── Default Format ────────────────────────────────────────
  const fmtSelect = document.getElementById('default-format');
  if (fmtSelect) {
    fmtSelect.addEventListener('change', () => {
      persistSettings({ defaultFormat: fmtSelect.value });
    });
  }

  // ── Notifications Toggle ──────────────────────────────────
  const notifToggle = document.getElementById('toggle-notifications');
  if (notifToggle) {
    notifToggle.addEventListener('change', () => {
      persistSettings({ showNotifications: notifToggle.checked });
    });
  }

  // ── Export ────────────────────────────────────────────────
  const btnExport = document.getElementById('opt-btn-export');
  if (btnExport) btnExport.addEventListener('click', handleExport);

  // ── Import ────────────────────────────────────────────────
  const btnImport  = document.getElementById('opt-btn-import');
  const fileInput  = document.getElementById('opt-import-file');
  if (btnImport)  btnImport.addEventListener('click', () => fileInput.click());
  if (fileInput)  fileInput.addEventListener('change', handleImport);

  // ── Clear All Data ────────────────────────────────────────
  const btnClearAll = document.getElementById('opt-btn-clear-all');
  if (btnClearAll) {
    btnClearAll.addEventListener('click', async () => {
      if (!confirm('This will permanently delete all your history, favorites, and settings. Continue?')) return;

      await Promise.all([
        sendMessage({ type: 'CLEAR_HISTORY' }),
        chrome.storage.local.remove(['colorFavorites', 'colorPickerSettings']),
      ]);

      // Seed defaults again
      await sendMessage({
        type: 'SAVE_SETTINGS',
        payload: { theme: 'auto', defaultFormat: 'hex', showNotifications: true },
      });

      settings = {};
      populateUI();
      showToast('All data cleared', 'success');
    });
  }
}

// ─── Export ────────────────────────────────────────────────────────────────────

async function handleExport() {
  const res = await sendMessage({ type: 'EXPORT_COLORS' });
  if (!res.success) { showToast('Export failed', 'error'); return; }

  const blob = new Blob([res.data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `color-picker-export-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Exported successfully', 'success');
}

// ─── Import ────────────────────────────────────────────────────────────────────

async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  const reader = new FileReader();
  reader.onload = async (ev) => {
    const res = await sendMessage({
      type:    'IMPORT_COLORS',
      payload: { jsonString: ev.target.result },
    });
    if (res.success) showToast('Import successful', 'success');
    else showToast(res.error || 'Import failed', 'error');
  };
  reader.onerror = () => showToast('Could not read file', 'error');
  reader.readAsText(file);
}

// ─── Toast ────────────────────────────────────────────────────────────────────

let toastTimer = null;

function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast show${type ? ' ' + type : ''}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

// ─── Messaging ────────────────────────────────────────────────────────────────

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { success: false });
      }
    });
  });
}
