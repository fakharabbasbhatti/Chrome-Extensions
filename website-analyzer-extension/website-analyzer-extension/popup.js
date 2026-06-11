// popup.js — BrandScan Extension Popup Logic

// ─── State ───────────────────────────────────────────
let currentData = null;

// ─── DOM Refs ─────────────────────────────────────────
const urlInput    = document.getElementById('urlInput');
const scanBtn     = document.getElementById('scanBtn');
const loading     = document.getElementById('loading');
const errorBanner = document.getElementById('errorBanner');
const errorMsg    = document.getElementById('errorMsg');
const results     = document.getElementById('results');
const siteMeta    = document.getElementById('siteMeta');
const colorGrid   = document.getElementById('colorGrid');
const btnSubsection = document.getElementById('btnSubsection');
const btnSwatches   = document.getElementById('btnSwatches');
const contactList   = document.getElementById('contactList');
const socialSection = document.getElementById('socialSection');
const socialList    = document.getElementById('socialList');
const themeToggle   = document.getElementById('themeToggle');
const toast         = document.getElementById('toast');
const exportJson    = document.getElementById('exportJson');
const exportCsv     = document.getElementById('exportCsv');
const hint          = document.getElementById('hint');

// ─── Theme ───────────────────────────────────────────
const savedTheme = localStorage.getItem('brandscan-theme') || 'light';
document.body.className = savedTheme;

themeToggle.addEventListener('click', () => {
  const isDark = document.body.classList.toggle('dark');
  document.body.classList.toggle('light', !isDark);
  localStorage.setItem('brandscan-theme', isDark ? 'dark' : 'light');
});

// ─── Auto-fill current tab URL ────────────────────────
chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  const tab = tabs[0];
  if (tab?.url && tab.url.startsWith('http')) {
    urlInput.value = tab.url;
  }
});

// ─── Scan ─────────────────────────────────────────────
scanBtn.addEventListener('click', startScan);
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') startScan(); });

function startScan() {
  const url = urlInput.value.trim();
  if (!url) {
    showError('Please enter a website URL.');
    return;
  }

  setState('loading');

  chrome.runtime.sendMessage({ action: 'analyzeUrl', url }, response => {
    if (chrome.runtime.lastError) {
      showError('Extension error: ' + chrome.runtime.lastError.message);
      return;
    }
    if (!response?.success) {
      showError(response?.error || 'Failed to analyze website.');
      return;
    }
    currentData = response.data;
    renderResults(currentData);
    setState('results');
  });
}

// ─── State Management ─────────────────────────────────
function setState(state) {
  loading.hidden     = state !== 'loading';
  errorBanner.hidden = state !== 'error';
  results.hidden     = state !== 'results';

  if (state === 'loading') {
    hint.textContent = '';
    scanBtn.disabled = true;
    scanBtn.querySelector('.scan-btn-text').textContent = 'Scanning…';
  } else {
    scanBtn.disabled = false;
    scanBtn.querySelector('.scan-btn-text').textContent = 'Scan';
    hint.textContent = 'Works on any publicly accessible website.';
  }
}

function showError(msg) {
  errorMsg.textContent = msg;
  setState('error');
}

// ─── Render ───────────────────────────────────────────
function renderResults(data) {
  // Site meta
  const domain = data.domain || new URL(data.url).hostname;
  siteMeta.innerHTML = `
    <span>🔍</span>
    <span><strong>${escHtml(document.getElementById('urlInput').value.trim())}</strong></span>
    <span style="margin-left:auto;font-size:11px">${new Date(data.extractedAt).toLocaleTimeString()}</span>
  `;

  renderColors(data.colors || {});
  renderContact(data.contact || {});
  renderSocial(data.social || {});
}

// ─── Colors ───────────────────────────────────────────
const COLOR_LABELS = {
  primary:    { label: 'Primary',    title: 'Brand primary color' },
  secondary:  { label: 'Secondary',  title: 'Brand secondary color' },
  background: { label: 'Background', title: 'Page background color' },
  text:       { label: 'Body Text',  title: 'Main text color' },
  h1:         { label: 'H1 Heading', title: 'H1 heading color' },
  headings:   { label: 'H2–H6',      title: 'Secondary heading color' },
  links:      { label: 'Links',      title: 'Link color' },
};

function renderColors(colors) {
  colorGrid.innerHTML = '';

  Object.entries(COLOR_LABELS).forEach(([key, meta]) => {
    const hex = colors[key];
    if (!hex) return;

    const row = document.createElement('div');
    row.className = 'color-row';
    row.title = `Click to copy ${hex}`;
    row.innerHTML = `
      <div class="color-swatch" style="background:${hex}"></div>
      <div class="color-info">
        <div class="color-label">${meta.label}</div>
        <div class="color-hex">${hex}</div>
      </div>
      <div class="copy-hint">copy</div>
    `;
    row.addEventListener('click', () => copyToClipboard(hex, row));
    colorGrid.appendChild(row);
  });

  // Button colors
  const buttons = colors.buttons || [];
  if (buttons.length) {
    btnSubsection.hidden = false;
    btnSwatches.innerHTML = '';
    buttons.forEach(btn => {
      const swatch = document.createElement('div');
      swatch.className = 'btn-swatch';
      swatch.style.background = btn.bg;
      swatch.style.color = btn.text || '#fff';
      swatch.textContent = btn.bg;
      swatch.title = `Click to copy ${btn.bg}`;
      swatch.addEventListener('click', () => copyToClipboard(btn.bg, swatch));
      btnSwatches.appendChild(swatch);
    });
  } else {
    btnSubsection.hidden = true;
  }
}

// ─── Contact ──────────────────────────────────────────
function renderContact(contact) {
  const items = [];

  (contact.emails || []).forEach(email => {
    items.push({ icon: '✉', label: 'Email', value: email, copy: email });
  });

  (contact.phones || []).forEach(phone => {
    items.push({ icon: '☎', label: 'Phone', value: phone, copy: phone });
  });

  (contact.whatsapp || []).forEach(num => {
    items.push({ icon: '💬', label: 'WhatsApp', value: num, copy: num });
  });

  if (contact.contactPage) {
    items.push({
      icon: '🔗',
      label: 'Contact Page',
      value: `<a href="${escHtml(contact.contactPage)}" target="_blank">${escHtml(contact.contactPage)}</a>`,
      copy: contact.contactPage,
      isHtml: true
    });
  }

  if (!items.length) {
    contactList.innerHTML = '<p class="empty-state">No contact info found on this page.</p>';
    return;
  }

  contactList.innerHTML = '';
  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'contact-item';
    el.innerHTML = `
      <div class="contact-left">
        <div class="contact-icon">${item.icon}</div>
        <div class="contact-info">
          <div class="contact-label">${item.label}</div>
          <div class="contact-value">${item.isHtml ? item.value : escHtml(item.value)}</div>
        </div>
      </div>
      <button class="copy-btn">Copy</button>
    `;
    el.querySelector('.copy-btn').addEventListener('click', e => {
      copyToClipboard(item.copy, e.target);
    });
    contactList.appendChild(el);
  });
}

// ─── Social ───────────────────────────────────────────
const BADGE_MAP = { fb: 'F', ig: '▣', tw: '𝕏', li: 'in', yt: '▶', tt: '♪', pt: 'P' };
const BADGE_LABEL_MAP = { fb: 'fb', ig: 'ig', tw: 'tw', li: 'li', yt: 'yt', tt: 'tt', pt: 'pt' };

function renderSocial(social) {
  const entries = Object.entries(social);
  if (!entries.length) {
    socialSection.hidden = true;
    return;
  }

  socialSection.hidden = false;
  socialList.innerHTML = '';

  entries.forEach(([, platform]) => {
    const item = document.createElement('div');
    item.className = 'social-item';
    const badgeClass = `badge-${platform.icon}`;
    const badgeChar = BADGE_MAP[platform.icon] || platform.icon;

    item.innerHTML = `
      <div class="social-badge ${badgeClass}">${badgeChar}</div>
      <div class="social-info">
        <div class="social-name">${escHtml(platform.label)}</div>
        <div class="social-url">${escHtml(platform.url)}</div>
      </div>
      <div class="social-actions">
        <button class="copy-btn">Copy</button>
      </div>
    `;

    item.style.cursor = 'pointer';
    item.addEventListener('click', (e) => {
      if (e.target.closest('.copy-btn')) return;
      chrome.tabs.create({ url: platform.url });
    });
    item.querySelector('.copy-btn').addEventListener('click', e => {
      e.stopPropagation();
      copyToClipboard(platform.url, e.target);
    });
    socialList.appendChild(item);
  });
}

// ─── Export ───────────────────────────────────────────
exportJson.addEventListener('click', () => {
  if (!currentData) return;
  const blob = new Blob([JSON.stringify(currentData, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `brandscan-${currentData.domain}.json`);
});

exportCsv.addEventListener('click', () => {
  if (!currentData) return;
  const rows = [['Category', 'Key', 'Value']];
  const { colors, contact, social, domain, url } = currentData;

  rows.push(['Site', 'Domain', domain]);
  rows.push(['Site', 'URL', url]);

  if (colors) {
    const colorKeys = ['primary', 'secondary', 'background', 'text', 'h1', 'headings', 'links'];
    colorKeys.forEach(k => {
      if (colors[k]) rows.push(['Color', k, colors[k]]);
    });
    (colors.buttons || []).forEach((b, i) => {
      rows.push(['Color', `button_${i + 1}_bg`, b.bg]);
      if (b.text) rows.push(['Color', `button_${i + 1}_text`, b.text]);
    });
  }

  if (contact) {
    (contact.emails || []).forEach(e => rows.push(['Contact', 'email', e]));
    (contact.phones || []).forEach(p => rows.push(['Contact', 'phone', p]));
    (contact.whatsapp || []).forEach(w => rows.push(['Contact', 'whatsapp', w]));
    if (contact.contactPage) rows.push(['Contact', 'contact_page', contact.contactPage]);
  }

  if (social) {
    Object.entries(social).forEach(([k, v]) => {
      rows.push(['Social', k, v.url]);
    });
  }

  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  downloadBlob(blob, `brandscan-${currentData.domain}.csv`);
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Clipboard ────────────────────────────────────────
function copyToClipboard(text, triggerEl) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied!');
    if (triggerEl?.classList.contains('copy-btn')) {
      triggerEl.textContent = '✓';
      triggerEl.classList.add('copied');
      setTimeout(() => {
        triggerEl.textContent = 'Copy';
        triggerEl.classList.remove('copied');
      }, 1500);
    }
  }).catch(() => {
    showToast('Copy failed');
  });
}

let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 1800);
}

// ─── Utils ────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
