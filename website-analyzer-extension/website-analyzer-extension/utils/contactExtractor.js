// utils/contactExtractor.js - Extracts contact information from a webpage

window.ContactExtractor = (() => {

  const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const PHONE_REGEX = /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{2,4}[\s\-.]?\d{2,9}/g;
  const WHATSAPP_PATTERNS = [
    /(?:wa\.me|whatsapp\.com\/send[?&]phone=|api\.whatsapp\.com\/send[?&]phone=)[\/=]?(\+?[\d\s\-().]+)/gi,
    /whatsapp[:\s]+(\+?[\d\s\-().]{7,20})/gi
  ];

  function dedupe(arr) {
    return [...new Set(arr.map(s => s.trim()).filter(Boolean))];
  }

  function cleanPhone(p) {
    // Must have at least 7 digits
    const digits = p.replace(/\D/g, '');
    return digits.length >= 7 ? p.trim() : null;
  }

  function getPageText() {
    return document.body?.innerText || document.body?.textContent || '';
  }

  function extractEmails() {
    const found = new Set();

    // From page text
    const text = getPageText();
    const textMatches = text.match(EMAIL_REGEX) || [];
    textMatches.forEach(e => found.add(e.toLowerCase()));

    // From mailto links
    document.querySelectorAll('a[href^="mailto:"]').forEach(el => {
      const email = el.href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
      if (email && EMAIL_REGEX.test(email)) found.add(email);
    });

    // Filter spam/bot traps
    const filtered = [...found].filter(e =>
      !e.includes('example.com') &&
      !e.includes('yourdomain') &&
      !e.includes('domain.com') &&
      !e.endsWith('.png') &&
      !e.endsWith('.jpg')
    );

    return dedupe(filtered).slice(0, 6);
  }

  function extractPhones() {
    const found = new Set();

    // From tel: links (most reliable)
    document.querySelectorAll('a[href^="tel:"]').forEach(el => {
      const num = decodeURIComponent(el.href.replace('tel:', '')).trim();
      if (num) found.add(num);
    });

    // From visible text near phone-related keywords
    const text = getPageText();
    const phoneMatches = text.match(PHONE_REGEX) || [];
    phoneMatches.forEach(p => {
      const cleaned = cleanPhone(p);
      if (cleaned) found.add(cleaned);
    });

    return dedupe([...found])
      .filter(p => cleanPhone(p))
      .slice(0, 5);
  }

  function extractWhatsApp() {
    const found = new Set();

    // From wa.me links
    document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp.com"]').forEach(el => {
      const url = el.href;
      const match = url.match(/wa\.me\/(\+?[\d]+)|phone=(\+?[\d]+)/i);
      if (match) {
        const num = (match[1] || match[2]).replace(/\D/g, '');
        if (num.length >= 7) found.add('+' + num);
      }
    });

    // From text patterns
    const text = getPageText();
    WHATSAPP_PATTERNS.forEach(re => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        const num = m[1]?.replace(/[\s\-().]/g, '');
        if (num && num.replace(/\D/g, '').length >= 7) found.add(num);
      }
    });

    return dedupe([...found]).slice(0, 3);
  }

  function findContactPage() {
    const keywords = ['contact', 'about', 'reach', 'get-in-touch', 'support', 'help'];
    const links = [...document.querySelectorAll('a[href]')];
    for (const link of links) {
      const href = link.href.toLowerCase();
      const text = link.textContent.toLowerCase().trim();
      if (keywords.some(k => href.includes(k) || text.includes(k))) {
        // Only return same-origin contact pages
        try {
          const url = new URL(link.href);
          if (url.origin === window.location.origin) {
            return link.href;
          }
        } catch { /* skip */ }
      }
    }
    return null;
  }

  function extractContact() {
    return {
      emails: extractEmails(),
      phones: extractPhones(),
      whatsapp: extractWhatsApp(),
      contactPage: findContactPage()
    };
  }

  return { extractContact };
})();
