# Full Page Screenshot — Chrome Extension

Capture the entire webpage — from top to bottom — as a single PNG, no matter how long the page is.

---

## Features

- **Full-page capture** — scrolls through the entire page and stitches all strips into one seamless image
- **Automatic stitching** — uses OffscreenCanvas in the service worker; no external libraries
- **Fixed element handling** — temporarily hides sticky headers/navbars so they don't repeat across strips
- **PNG download** — timestamped filename (`fullpage-screenshot-YYYY-MM-DD-HH-MM-SS.png`)
- **Live progress** — real-time progress bar and status messages during capture
- **Preview** — inline thumbnail before downloading
- **Session memory** — re-opening the popup shows the last capture until the browser session ends

---

## Installation (Developer Mode)

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer Mode** (top-right toggle).
4. Click **Load unpacked**.
5. Select the `fullpage-screenshot-extension` folder.
6. The extension icon appears in the toolbar.

---

## Usage

1. Navigate to any webpage.
2. Click the **Full Page Screenshot** icon in the toolbar.
3. Click **Capture Full Page**.
4. Wait for the progress bar to complete (the page will scroll automatically).
5. Review the preview thumbnail.
6. Click **Download PNG** to save the file.

---

## File Structure

```
fullpage-screenshot-extension/
├── manifest.json       # Extension manifest (MV3)
├── background.js       # Service worker — orchestrates capture & download
├── content.js          # Injected into pages — scrolling & dimension helpers
├── capture.js          # (Reference) Core capture algorithm documentation
├── popup.html          # Extension popup UI
├── popup.css           # Popup styles
├── popup.js            # Popup UI logic & message handling
├── utils.js            # Shared utility functions
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## Architecture

```
popup.js
  │  START_CAPTURE / DOWNLOAD_SCREENSHOT
  ▼
background.js (service worker)
  │  executeScript → content.js
  │  sendMessage ↔ GET_PAGE_DIMENSIONS / SCROLL_TO / HIDE_FIXED / …
  │  captureVisibleTab (per strip)
  │  OffscreenCanvas stitch
  │  storage.session.set(result)
  │  sendMessage → popup (CAPTURE_PROGRESS / CAPTURE_DONE / CAPTURE_ERROR)
  ▼
content.js (injected in page)
  – Reports scrollWidth / scrollHeight
  – Performs window.scrollTo()
  – Hides/restores position:fixed & position:sticky elements
```

---

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Access the current tab's URL to check restrictions |
| `tabs` | Get tab info (id, windowId, url) |
| `scripting` | Inject `content.js` into the page |
| `downloads` | Trigger the PNG download |
| `storage` | Cache the screenshot in `session` storage for preview |
| `host_permissions: <all_urls>` | Capture screenshots on any site |

---

## Limitations

- **Chrome internal pages** (`chrome://`, `chrome-extension://`, `about:`, `edge://`) cannot be captured — this is a hard Chrome security restriction.
- Pages taller than **30,000 CSS pixels** are capped to prevent out-of-memory crashes.
- Pages that block `window.scrollTo` (e.g. custom scroll containers) may produce incomplete captures.
- The `captureVisibleTab` API requires the extension window to remain active; minimising Chrome during capture may interrupt it.

---

## Troubleshooting

**"This page is restricted"** — Navigate to a normal `https://` website and try again.

**Blank strips in output** — The page may load content lazily. The extension waits 200ms per strip; for very slow pages this may occasionally miss content.

**Download not starting** — Check that Chrome has permission to download files automatically (Settings → Downloads).

---

## License

MIT — free to use, modify, and distribute.
