// content.js - Coordinator: runs all extractors and packages results

window.__extractSiteData = function () {
  try {
    const colors = window.ColorExtractor?.extractColors() || {};
    const contact = window.ContactExtractor?.extractContact() || {};
    const social = window.SocialExtractor?.extractSocial() || {};

    return {
      url: window.location.href,
      domain: window.location.hostname,
      title: document.title,
      colors,
      contact,
      social,
      extractedAt: new Date().toISOString()
    };
  } catch (e) {
    return { error: e.message };
  }
};
