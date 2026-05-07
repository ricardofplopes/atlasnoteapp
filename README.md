# AtlasNote Desktop

A native Windows container application for [AtlasNote](https://github.com/ricardofplopes/atlasnote) — wraps your self-hosted AtlasNote instance in a desktop window with system tray integration.

## Features

- **Server Configuration** — Connect to any AtlasNote instance by entering the server URL
- **Connection Validation** — Tests connectivity before connecting
- **System Tray** — Minimize to tray, double-click to restore
- **Native Menu** — Settings (Ctrl+,), Reload (Ctrl+R), Zoom, DevTools
- **Persistent Config** — Server URL saved locally, auto-connects on launch
- **External Links** — Opens links in your default browser

## Screenshots

### Setup Screen
On first launch, configure your AtlasNote server URL:

![Setup Screen](docs/setup-screenshot.png)

### Main Window
After connecting, AtlasNote loads in a native window:

![Main Window](docs/main-screenshot.png)

## Installation

### Portable (No Install Required)
1. Download `AtlasNote 1.0.0.exe` from [Releases](https://github.com/ricardofplopes/atlasnoteapp/releases)
2. Run the executable
3. Enter your AtlasNote server URL (e.g., `http://localhost:3000`)
4. Click **Connect**

### NSIS Installer
1. Download the installer from [Releases](https://github.com/ricardofplopes/atlasnoteapp/releases)
2. Run the installer and choose your installation directory
3. Launch AtlasNote from the Start Menu

## Development

### Prerequisites
- [Node.js](https://nodejs.org/) 20+
- npm

### Setup
```bash
git clone https://github.com/ricardofplopes/atlasnoteapp.git
cd atlasnoteapp
npm install
```

### Run in Development
```bash
npm run dev
```

### Build Distributable
```bash
# Portable .exe only
npm run dist:portable

# Full build (NSIS installer + portable)
npm run dist
```

Output will be in the `release/` directory.

## Configuration

The app stores its config in your user data directory:
- **Windows:** `%APPDATA%\atlasnoteapp\config.json`

The config file contains:
```json
{
  "serverUrl": "http://localhost:3000"
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+,` | Open Settings (change server URL) |
| `Ctrl+R` | Reload page |
| `Ctrl++` | Zoom in |
| `Ctrl+-` | Zoom out |
| `Ctrl+0` | Reset zoom |
| `F11` | Toggle fullscreen |
| `Ctrl+Shift+I` | Developer Tools |

## Tech Stack

- **Electron** 33 — Desktop container
- **TypeScript** — Type-safe main/preload processes
- **electron-builder** — Windows packaging (NSIS + portable)

## License

MIT
