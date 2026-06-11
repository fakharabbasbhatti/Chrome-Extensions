# Advanced Color Picker Pro

A production-ready Chrome Extension (Manifest V3) for picking, converting, and managing colors from any webpage.

---

## Features

| Feature | Details |
|---|---|
| 🎯 **EyeDropper** | Native browser EyeDropper API — click any pixel on screen |
| 🎨 **5 Color Formats** | HEX, RGB, RGBA, HSL, HSV — switch with one click |
| 📋 **One-Click Copy** | Copy any format to clipboard instantly |
| 🕓 **Color History** | Auto-saves last 50 picked colors |
| ⭐ **Favorites** | Save colors you want to keep long-term |
| 📤 **Export / Import** | Full backup and restore as JSON |
| 🌙 **Dark Mode** | Auto, light, or dark — follows system preference |
| ⌨️ **Keyboard Shortcut** | `Alt + Shift + C` on any page |

---

## Installation

1. Download or clone this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked**.
5. Select the `advanced-color-picker-pro` folder.
6. The extension icon will appear in your toolbar.

---

## Usage

### Pick a Color
1. Click the extension icon to open the popup.
2. Press **Pick from Screen** — your cursor becomes a color sampler.
3. Click any pixel on the page to capture its color.

### Copy a Color Value
1. Select your desired format (HEX, RGB, RGBA, HSL, HSV) using the format tabs.
2. Click the **copy** icon next to the value.

### Save to Favorites
Click **Save to Favorites** to bookmark the current color permanently.

### Keyboard Shortcut
Press `Alt + Shift + C` on any regular webpage to activate the EyeDropper directly — no popup required.

### Export / Import
- **Export**: Click **Export JSON** in the History panel to download all your colors.
- **Import**: Click **Import JSON** to restore from a previously exported file.

### Settings
Click the ⚙️ gear icon to open the settings page:
- Switch between **Auto / Light / Dark** themes.
- Set your preferred **default color format**.
- Toggle notifications.
- Export, import, or clear all data.

---

## File Structure

```
advanced-color-picker-pro/
├── manifest.json          # MV3 manifest
├── background.js          # Service worker: storage, messaging, badge
├── content.js             # Injected script: EyeDropper bridge, toast
├── color-picker.js        # Pure JS color conversion library
├── popup.html             # Extension popup
├── popup.css              # Popup styles (dark/light themes)
├── popup.js               # Popup controller
├── options.html           # Settings page
├── options.css            # Settings styles
├── options.js             # Settings controller
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## Browser Compatibility

| Browser | EyeDropper API | Notes |
|---|---|---|
| Chrome 95+ | ✅ | Full support |
| Edge 95+ | ✅ | Full support |
| Firefox | ❌ | EyeDropper not yet supported |
| Safari | ❌ | EyeDropper not yet supported |

The extension gracefully informs users when the EyeDropper API is unavailable.

---

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Save color history, favorites, and settings |
| `activeTab` | Communicate with the current tab for EyeDropper |
| `scripting` | Inject content script when needed |
| `clipboardWrite` | Copy color values to clipboard |
| `clipboardRead` | Paste support |
| `<all_urls>` | Allow EyeDropper on any webpage |

---

## Architecture

```
popup.js  ──messages──▶  background.js (service worker)
                               │
                         chrome.storage.local
                               │
content.js ◀──messages──  background.js
     │
  EyeDropper API
```

- **`color-picker.js`** is a self-contained utility library included in both popup and content contexts.
- **`background.js`** is the single source of truth for all persisted data.
- **`popup.js`** and **`options.js`** communicate exclusively via `chrome.runtime.sendMessage`.

---

## Development

No build step required. All files are plain HTML/CSS/JS.

To reload after edits: go to `chrome://extensions` and click the refresh ↺ icon next to the extension.

---

## License

MIT — free to use, modify, and distribute.
