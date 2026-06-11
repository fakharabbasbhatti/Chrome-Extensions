/**
 * color-picker.js
 * Core color conversion and utility library for Advanced Color Picker Pro.
 * No external dependencies — all conversions are pure JS.
 */

'use strict';

const ColorUtils = (() => {

  // ─── Validation ────────────────────────────────────────────────────────────

  /**
   * Validate that a hex string is valid (3, 4, 6, or 8 char with optional #).
   * @param {string} hex
   * @returns {boolean}
   */
  function isValidHex(hex) {
    return /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(hex);
  }

  // ─── Normalisation ─────────────────────────────────────────────────────────

  /**
   * Expand shorthand hex (#RGB → #RRGGBB, #RGBA → #RRGGBBAA).
   * Always returns a lowercase string with leading #.
   * @param {string} hex
   * @returns {string|null}
   */
  function normaliseHex(hex) {
    let h = hex.replace('#', '').toLowerCase();
    if (h.length === 3)  h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    if (h.length === 4)  h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]+h[3]+h[3];
    if (h.length !== 6 && h.length !== 8) return null;
    return '#' + h;
  }

  // ─── HEX ↔ RGB(A) ──────────────────────────────────────────────────────────

  /**
   * Parse a hex colour string into {r, g, b, a} (a is 0–1, defaults 1).
   * @param {string} hex
   * @returns {{r:number, g:number, b:number, a:number}|null}
   */
  function hexToRgba(hex) {
    const n = normaliseHex(hex);
    if (!n) return null;
    const h = n.slice(1);
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? +(parseInt(h.slice(6, 8), 16) / 255).toFixed(3) : 1,
    };
  }

  /**
   * Convert {r,g,b,a} to a #RRGGBB or #RRGGBBAA hex string.
   * @param {number} r  0-255
   * @param {number} g  0-255
   * @param {number} b  0-255
   * @param {number} [a=1]  0-1
   * @returns {string}
   */
  function rgbaToHex(r, g, b, a = 1) {
    const toH = v => Math.round(v).toString(16).padStart(2, '0');
    const base = `#${toH(r)}${toH(g)}${toH(b)}`;
    if (a === 1) return base;
    return base + toH(Math.round(a * 255));
  }

  // ─── RGB ↔ HSL ─────────────────────────────────────────────────────────────

  /**
   * Convert {r,g,b} (0-255) to {h:0-360, s:0-100, l:0-100}.
   * @param {number} r
   * @param {number} g
   * @param {number} b
   * @returns {{h:number, s:number, l:number}}
   */
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: +(l * 100).toFixed(1) };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6;
    }
    return {
      h: +(h * 360).toFixed(1),
      s: +(s * 100).toFixed(1),
      l: +(l * 100).toFixed(1),
    };
  }

  /**
   * Convert {h:0-360, s:0-100, l:0-100} to {r,g,b} (0-255).
   * @param {number} h
   * @param {number} s
   * @param {number} l
   * @returns {{r:number, g:number, b:number}}
   */
  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return {
      r: Math.round(f(0) * 255),
      g: Math.round(f(8) * 255),
      b: Math.round(f(4) * 255),
    };
  }

  // ─── RGB ↔ HSV ─────────────────────────────────────────────────────────────

  /**
   * Convert {r,g,b} (0-255) to {h:0-360, s:0-100, v:0-100}.
   * @param {number} r
   * @param {number} g
   * @param {number} b
   * @returns {{h:number, s:number, v:number}}
   */
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const v = max;
    const d = max - min;
    const s = max === 0 ? 0 : d / max;
    let h = 0;
    if (max !== min) {
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        default: h = ((r - g) / d + 4) / 6;
      }
    }
    return {
      h: +(h * 360).toFixed(1),
      s: +(s * 100).toFixed(1),
      v: +(v * 100).toFixed(1),
    };
  }

  /**
   * Convert {h:0-360, s:0-100, v:0-100} to {r,g,b} (0-255).
   * @param {number} h
   * @param {number} s
   * @param {number} v
   * @returns {{r:number, g:number, b:number}}
   */
  function hsvToRgb(h, s, v) {
    s /= 100; v /= 100;
    const i = Math.floor(h / 60) % 6;
    const f = h / 60 - Math.floor(h / 60);
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    const [r, g, b] = [
      [v,t,p,p,q,v],
      [q,v,v,t,p,p],
      [p,p,q,v,v,t],
    ].map(ch => Math.round(ch[i] * 255));
    return { r, g, b };
  }

  // ─── Luminance & Contrast ─────────────────────────────────────────────────

  /**
   * Calculate relative luminance (WCAG 2.1) for a colour.
   * @param {number} r 0-255
   * @param {number} g 0-255
   * @param {number} b 0-255
   * @returns {number} 0–1
   */
  function relativeLuminance(r, g, b) {
    const lin = v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  /**
   * Decide whether to overlay white or black text on a given background.
   * @param {number} r 0-255
   * @param {number} g 0-255
   * @param {number} b 0-255
   * @returns {'#ffffff'|'#000000'}
   */
  function contrastText(r, g, b) {
    return relativeLuminance(r, g, b) > 0.179 ? '#000000' : '#ffffff';
  }

  // ─── Format Strings ────────────────────────────────────────────────────────

  /**
   * Produce all display-ready format strings from an RGBA object.
   * @param {{r:number, g:number, b:number, a:number}} rgba
   * @returns {{ hex:string, rgb:string, rgba:string, hsl:string, hsv:string }}
   */
  function formatsFrom(rgba) {
    const { r, g, b, a } = rgba;
    const hsl = rgbToHsl(r, g, b);
    const hsv = rgbToHsv(r, g, b);
    return {
      hex:  rgbaToHex(r, g, b, a),
      rgb:  `rgb(${r}, ${g}, ${b})`,
      rgba: `rgba(${r}, ${g}, ${b}, ${a})`,
      hsl:  `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
      hsv:  `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`,
    };
  }

  /**
   * Parse any CSS colour string (hex, rgb, rgba, hsl) into an RGBA object.
   * Returns null when the string can't be parsed.
   * @param {string} str
   * @returns {{r:number, g:number, b:number, a:number}|null}
   */
  function parseColorString(str) {
    str = str.trim();

    // HEX
    if (str.startsWith('#') || /^[0-9a-fA-F]{3,8}$/.test(str)) {
      return hexToRgba(str.startsWith('#') ? str : '#' + str);
    }

    // rgb() / rgba()
    const rgbMatch = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (rgbMatch) {
      return {
        r: +rgbMatch[1], g: +rgbMatch[2], b: +rgbMatch[3],
        a: rgbMatch[4] !== undefined ? +rgbMatch[4] : 1,
      };
    }

    // hsl()
    const hslMatch = str.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?(?:\s*,\s*([\d.]+))?\s*\)/);
    if (hslMatch) {
      const { r, g, b } = hslToRgb(+hslMatch[1], +hslMatch[2], +hslMatch[3]);
      return { r, g, b, a: hslMatch[4] !== undefined ? +hslMatch[4] : 1 };
    }

    return null;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  return {
    isValidHex,
    normaliseHex,
    hexToRgba,
    rgbaToHex,
    rgbToHsl,
    hslToRgb,
    rgbToHsv,
    hsvToRgb,
    relativeLuminance,
    contrastText,
    formatsFrom,
    parseColorString,
  };
})();

// Make available as a module export (service worker / popup) and as a global
// (content script, where modules aren't always available).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ColorUtils;
}
