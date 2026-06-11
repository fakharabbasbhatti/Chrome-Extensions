// utils/socialExtractor.js - Extracts social media links from a webpage

window.SocialExtractor = (() => {

  const PLATFORMS = {
    facebook: {
      patterns: [/facebook\.com\/(?!sharer|share|dialog|plugins|tr|watch)([a-zA-Z0-9._\-/%]+)/i],
      label: 'Facebook',
      icon: 'fb'
    },
    instagram: {
      patterns: [/instagram\.com\/([a-zA-Z0-9._]+)/i],
      label: 'Instagram',
      icon: 'ig'
    },
    twitter: {
      patterns: [/(?:twitter|x)\.com\/(?!intent|share|hashtag)([a-zA-Z0-9_]+)/i],
      label: 'Twitter / X',
      icon: 'tw'
    },
    linkedin: {
      patterns: [/linkedin\.com\/(company|in|school)\/([a-zA-Z0-9._\-]+)/i],
      label: 'LinkedIn',
      icon: 'li'
    },
    youtube: {
      patterns: [/youtube\.com\/(?:channel|c|user|@)\/([a-zA-Z0-9._\-@]+)/i, /youtube\.com\/@([a-zA-Z0-9._\-]+)/i],
      label: 'YouTube',
      icon: 'yt'
    },
    tiktok: {
      patterns: [/tiktok\.com\/@([a-zA-Z0-9._\-]+)/i],
      label: 'TikTok',
      icon: 'tt'
    },
    pinterest: {
      patterns: [/pinterest\.com\/([a-zA-Z0-9._\-]+)/i],
      label: 'Pinterest',
      icon: 'pt'
    }
  };

  function normalizeUrl(url) {
    // Make sure it's an absolute URL
    try {
      return new URL(url).href;
    } catch {
      return null;
    }
  }

  function extractSocial() {
    const found = {};
    const anchors = [...document.querySelectorAll('a[href]')];
    const hrefs = anchors.map(a => a.href).filter(Boolean);

    for (const [platform, config] of Object.entries(PLATFORMS)) {
      for (const href of hrefs) {
        for (const pattern of config.patterns) {
          const match = href.match(pattern);
          if (match) {
            const normalized = normalizeUrl(href.split('?')[0]);
            if (normalized && !found[platform]) {
              found[platform] = {
                url: normalized,
                label: config.label,
                icon: config.icon
              };
            }
          }
        }
      }
    }

    return found;
  }

  return { extractSocial };
})();
