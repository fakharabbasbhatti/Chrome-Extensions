// utils/colorExtractor.js - Extracts color palette from a webpage (v2 - dark site aware)

window.ColorExtractor = (() => {

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function rgbToHex(rgb) {
    if (!rgb) return null;
    if (rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return null;
    const match = rgb.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\s*\)/);
    if (!match) return null;
    const [, r, g, b] = match.map(Number);
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function getStyle(el, prop) {
    try {
      return rgbToHex(window.getComputedStyle(el).getPropertyValue(prop).trim());
    } catch { return null; }
  }

  function getRawStyle(el, prop) {
    try {
      return window.getComputedStyle(el).getPropertyValue(prop).trim();
    } catch { return null; }
  }

  // Parse hex to {r,g,b}
  function hexToRgb(hex) {
    const m = hex.replace('#', '').match(/.{2}/g);
    if (!m) return null;
    return { r: parseInt(m[0], 16), g: parseInt(m[1], 16), b: parseInt(m[2], 16) };
  }

  // Perceived luminance 0-1
  function luminance(hex) {
    const c = hexToRgb(hex);
    if (!c) return 0;
    const toLinear = v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
  }

  // Color saturation (0-1)
  function saturation(hex) {
    const c = hexToRgb(hex);
    if (!c) return 0;
    const r = c.r / 255, g = c.g / 255, b = c.b / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return 0;
    const d = max - min;
    return l > 0.5 ? d / (2 - max - min) : d / (max + min);
  }

  // Is this a "chromatic" (non-neutral) color? Saturation > threshold
  function isChromatic(hex, threshold = 0.15) {
    return saturation(hex) > threshold;
  }

  // Is this a near-white color (luminance > 0.85)?
  function isNearWhite(hex) { return luminance(hex) > 0.85; }

  // Is this a near-black color (luminance < 0.05)?
  function isNearBlack(hex) { return luminance(hex) < 0.05; }

  // Is this a "useful" color — not pure transparent
  function isNotTransparent(hex) { return hex !== null; }

  // Frequency map → sorted entries
  function freqMap(arr) {
    const map = {};
    arr.filter(Boolean).forEach(v => { map[v] = (map[v] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }

  function mostFrequent(arr) {
    return freqMap(arr)[0]?.[0] || null;
  }

  // Most frequent chromatic color (prefers colored over grey/neutral)
  function mostFrequentChromatic(arr, fallback = null) {
    const chromatic = arr.filter(h => h && isChromatic(h));
    return mostFrequent(chromatic) || fallback;
  }

  // CSS custom properties scan from :root / body
  function getCSSVars() {
    const vars = {};
    try {
      const sheets = [...document.styleSheets];
      for (const sheet of sheets) {
        let rules;
        try { rules = [...sheet.cssRules]; } catch { continue; }
        for (const rule of rules) {
          if (rule.selectorText === ':root' || rule.selectorText === 'body' || rule.selectorText === 'html') {
            const style = rule.style;
            for (let i = 0; i < style.length; i++) {
              const prop = style[i];
              if (prop.startsWith('--')) {
                const val = style.getPropertyValue(prop).trim();
                const hex = rgbToHex(val) || (val.startsWith('#') ? val.toUpperCase() : null);
                if (hex) vars[prop] = hex;
              }
            }
          }
        }
      }
    } catch { /* cross-origin sheets blocked */ }
    return vars;
  }

  // Inline style scan for CSS vars applied to elements
  function getInlineVarColors() {
    const found = [];
    const els = document.querySelectorAll('[style*="--"], [style*="color"], [style*="background"]');
    els.forEach(el => {
      const style = el.getAttribute('style') || '';
      const hexMatches = style.match(/#[0-9a-fA-F]{3,6}/g) || [];
      hexMatches.forEach(h => {
        const normalized = h.length === 4
          ? '#' + [...h.slice(1)].map(c => c + c).join('')
          : h;
        found.push(normalized.toUpperCase());
      });
    });
    return found;
  }

  // ─── Main Extractor ───────────────────────────────────────────────────────

  function extractColors() {
    const colors = {
      primary: null,
      secondary: null,
      background: null,
      text: null,
      h1: null,
      headings: null,
      buttons: [],
      links: null
    };

    // ── 1. Background ──────────────────────────────────────────────────────
    // Try body first, then html, then check sections for the dominant BG
    const bodyBg = getStyle(document.body, 'background-color');
    const htmlBg = getStyle(document.documentElement, 'background-color');

    // Collect bg from large structural containers to find the real dominant bg
    const bgEls = [
      document.body,
      document.documentElement,
      ...document.querySelectorAll('main, #root, #app, [class*="wrapper"], [class*="container"], section')
    ].slice(0, 20);

    const bgSamples = bgEls.map(el => getStyle(el, 'background-color')).filter(isNotTransparent);
    const bgFreq = freqMap(bgSamples);
    // Pick most frequent, prefer dark/light depending on what's dominant
    colors.background = bgFreq[0]?.[0] || bodyBg || htmlBg || '#FFFFFF';

    // ── 2. Text Color ──────────────────────────────────────────────────────
    // Sample from paragraphs, spans, divs — exclude elements inside nav/header/button
    const textEls = [...document.querySelectorAll('p, li, td, .content, [class*="text"], [class*="body"]')]
      .filter(el => !el.closest('nav, button, [role="button"]'))
      .slice(0, 80);

    const allTextColors = textEls.map(el => getStyle(el, 'color')).filter(isNotTransparent);
    // Prefer the most common non-white, non-black if possible, but accept any
    colors.text = mostFrequent(allTextColors) || '#CCCCCC';

    // ── 3. Headings ─────────────────────────────────────────────────────────
    const h1s = [...document.querySelectorAll('h1')];
    const h1Colors = h1s.map(el => getStyle(el, 'color')).filter(isNotTransparent);
    colors.h1 = mostFrequent(h1Colors) || colors.text;

    const subHeadings = [...document.querySelectorAll('h2, h3, h4, h5, h6')].slice(0, 40);
    const subColors = subHeadings.map(el => getStyle(el, 'color')).filter(isNotTransparent);
    colors.headings = mostFrequent(subColors) || colors.h1;

    // ── 4. Links ───────────────────────────────────────────────────────────
    const linkEls = [...document.querySelectorAll('a')].slice(0, 60);
    const linkColors = linkEls.map(el => getStyle(el, 'color')).filter(isNotTransparent);
    colors.links = mostFrequentChromatic(linkColors, mostFrequent(linkColors));

    // ── 5. Buttons ─────────────────────────────────────────────────────────
    const buttonSelectors = 'button, [role="button"], input[type="submit"], input[type="button"], a.btn, .btn, .button, [class*="btn"], [class*="cta"]';
    const buttonEls = [...document.querySelectorAll(buttonSelectors)].slice(0, 30);
    const btnData = [];

    buttonEls.forEach(btn => {
      const bg = getStyle(btn, 'background-color');
      const color = getStyle(btn, 'color');
      const borderColor = getStyle(btn, 'border-color');

      // A button background must be chromatic OR clearly different from page bg
      const effectiveBg = (bg && bg !== colors.background) ? bg : null;
      if (effectiveBg && !btnData.find(b => b.bg === effectiveBg)) {
        btnData.push({ bg: effectiveBg, text: color, border: borderColor });
      }
    });
    colors.buttons = btnData.slice(0, 4);

    // ── 6. Primary Color ───────────────────────────────────────────────────
    // Strategy: collect ALL colored candidates from the page with weights:
    //   - CSS custom properties (high weight — intentionally set)
    //   - Button backgrounds (very high weight — brand action color)
    //   - Inline hex colors from style attributes (medium weight)
    //   - Border/accent colors from nav, header, hero, cards
    //   - Text color of headings (often the accent color)

    const candidates = [];

    // CSS variables (triple weight)
    const cssVars = getCSSVars();
    Object.values(cssVars).forEach(hex => {
      if (isChromatic(hex) && !isNearWhite(hex) && !isNearBlack(hex)) {
        candidates.push(hex, hex, hex);
      }
    });

    // Inline hex colors (double weight)
    getInlineVarColors().forEach(hex => {
      if (isChromatic(hex)) candidates.push(hex, hex);
    });

    // Button backgrounds (quadruple weight — strongest brand signal)
    colors.buttons.forEach(b => {
      if (b.bg && isChromatic(b.bg)) {
        candidates.push(b.bg, b.bg, b.bg, b.bg);
      }
    });

    // Nav / header prominent elements (triple weight)
    const structuralEls = [
      ...document.querySelectorAll('nav, header, [class*="navbar"], [class*="nav-"], [class*="header"]')
    ].slice(0, 20);

    structuralEls.forEach(el => {
      const bg = getStyle(el, 'background-color');
      const border = getStyle(el, 'border-bottom-color');
      const color = getStyle(el, 'color');
      if (bg && isChromatic(bg) && bg !== colors.background) candidates.push(bg, bg, bg);
      if (border && isChromatic(border)) candidates.push(border, border, border);
      if (color && isChromatic(color)) candidates.push(color, color);
    });

    // Hero / banner sections (double weight)
    const heroEls = [
      ...document.querySelectorAll('[class*="hero"], [class*="banner"], [class*="jumbotron"], [class*="intro"], [id*="hero"], [id*="home"]')
    ].slice(0, 10);

    heroEls.forEach(el => {
      const bg = getStyle(el, 'background-color');
      if (bg && isChromatic(bg) && bg !== colors.background) candidates.push(bg, bg);
    });

    // Accent/highlight elements (borders, outlines, focus rings)
    const accentEls = [
      ...document.querySelectorAll('[class*="accent"], [class*="primary"], [class*="brand"], [class*="highlight"], [class*="active"]')
    ].slice(0, 20);

    accentEls.forEach(el => {
      const bg = getStyle(el, 'background-color');
      const color = getStyle(el, 'color');
      const border = getStyle(el, 'border-color');
      if (bg && isChromatic(bg)) candidates.push(bg, bg);
      if (color && isChromatic(color)) candidates.push(color, color);
      if (border && isChromatic(border)) candidates.push(border);
    });

    // Links are often the brand accent color
    if (colors.links && isChromatic(colors.links)) {
      candidates.push(colors.links, colors.links);
    }

    // H1/H2 colored text is often the accent
    [colors.h1, colors.headings].forEach(c => {
      if (c && isChromatic(c) && !isNearWhite(c) && !isNearBlack(c)) {
        candidates.push(c, c);
      }
    });

    // Svgs and icons — often colored with brand color
    const svgEls = [...document.querySelectorAll('svg, svg path, svg circle, svg rect, [class*="icon"]')].slice(0, 30);
    svgEls.forEach(el => {
      const fill = getStyle(el, 'fill');
      const stroke = getStyle(el, 'stroke');
      if (fill && isChromatic(fill)) candidates.push(fill);
      if (stroke && isChromatic(stroke)) candidates.push(stroke);
    });

    // Pick most frequent chromatic candidate as primary
    const primaryCandidate = mostFrequentChromatic(candidates);
    colors.primary = primaryCandidate || '#6C47FF';

    // ── 7. Secondary Color ─────────────────────────────────────────────────
    // Second most frequent chromatic color that differs from primary
    const secondaryCandidates = candidates.filter(c => c !== colors.primary);
    colors.secondary = mostFrequentChromatic(secondaryCandidates) || colors.headings || '#6C757D';

    // ── 8. Final Sanity Pass ───────────────────────────────────────────────
    // If primary == background, something went wrong — use link color or fallback
    if (colors.primary === colors.background) {
      colors.primary = colors.links || colors.h1 || '#6C47FF';
    }

    return colors;
  }

  return { extractColors };
})();
