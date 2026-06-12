/**
 * utils.js
 * Shared utility functions used across popup, background, and content scripts.
 */

/**
 * Generates a timestamp-based filename for the screenshot.
 * Format: fullpage-screenshot-YYYY-MM-DD-HH-MM-SS.png
 * @returns {string}
 */
function generateFilename() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `fullpage-screenshot-${date}-${time}.png`;
}

/**
 * Formats a file size in bytes to a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Checks whether a URL is restricted (chrome:// pages, extensions pages, etc.)
 * @param {string} url
 * @returns {boolean}
 */
function isRestrictedUrl(url) {
  if (!url) return true;
  const restricted = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'data:',
    'file://', // File URLs require additional permission
  ];
  return restricted.some((prefix) => url.startsWith(prefix));
}

/**
 * Clamps a number between min and max.
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Sleeps for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Make available in both module and non-module contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateFilename, formatFileSize, isRestrictedUrl, clamp, sleep };
}
