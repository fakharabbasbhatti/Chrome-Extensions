# BrandScan — Website Brand & Contact Extractor

A Chrome Extension (Manifest V3) that analyzes any website and extracts:
- 🎨 **Color palette** — primary, secondary, background, text, headings, buttons, links
- 📬 **Contact info** — emails, phone numbers, WhatsApp numbers, contact page URL
- 📱 **Social media links** — Facebook, Instagram, Twitter/X, LinkedIn, YouTube, TikTok, Pinterest

---

## Installation

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `website-analyzer-extension/` folder
5. The **BrandScan** icon will appear in your Chrome toolbar

---

## Usage

1. Click the **BrandScan** icon in the toolbar
2. The current tab's URL will be pre-filled automatically
3. Enter or edit the URL you want to analyze
4. Click **Scan** (or press Enter)
5. Wait a few seconds while the page is analyzed
6. View extracted colors, contact info, and social links

### Features
- **Copy** any color, contact, or social URL with one click
- **Export JSON** — full structured data download
- **Export CSV** — spreadsheet-friendly format
- **Dark / Light mode** toggle (persists across sessions)
- Click a social media row to open it in a new tab

---

## File Structure

```
website-analyzer-extension/
├── manifest.json           # Chrome Extension MV3 config
├── popup.html              # Extension popup UI
├── popup.css               # Styles (light + dark theme)
├── popup.js                # UI logic & interactivity
├── background.js           # Service worker — tab management & injection
├── content.js              # Extraction coordinator (injected into target page)
├── utils/
│   ├── colorExtractor.js   # DOM color analysis
│   ├── contactExtractor.js # Email, phone, WhatsApp detection
│   └── socialExtractor.js  # Social media link detection
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## How It Works

1. You enter a URL in the popup
2. The background service worker opens the URL in a hidden tab
3. The extractor scripts are injected into that tab
4. Color, contact, and social data are extracted from the live DOM
5. Results are sent back to the popup for display
6. The temporary tab is automatically closed

---

## Permissions Used

| Permission | Reason |
|---|---|
| `activeTab` | Read the current tab's URL for auto-fill |
| `scripting` | Inject extractor scripts into the target page |
| `tabs` | Open/close temporary analysis tab |
| `host_permissions: <all_urls>` | Analyze any website URL |

---

## Notes

- Works best on websites that load content in HTML (not fully JS-rendered SPAs)
- Some websites may block extension scripts or have strict CSP — results may vary
- No external APIs are used; all analysis is local DOM-based
- Data never leaves your browser

---

## Troubleshooting

**"Could not extract data"** — The website may block script injection. Try reloading the page and scanning again.

**Blank colors** — The site uses dynamically applied styles. The extension reads computed styles at load time.

**Missing contact info** — Contact details may be behind a contact form or loaded dynamically.
