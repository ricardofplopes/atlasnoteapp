import { app, BrowserWindow, ipcMain, Menu, Tray, shell, nativeImage } from "electron";
import * as path from "path";
import * as fs from "fs";

interface AppConfig {
  serverUrl: string;
  autoStart?: boolean;
}

// Paths - use app.getAppPath() for packaged app compatibility
const appRoot = app.getAppPath();
const preloadPath = path.join(appRoot, "dist", "preload.js");
const setupHtmlPath = path.join(appRoot, "src", "setup.html");
const iconPath = path.join(appRoot, "assets", "icon.png");

// Simple JSON store
const configPath = path.join(app.getPath("userData"), "config.json");

function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch {}
  return { serverUrl: "", autoStart: false };
}

function saveConfig(config: AppConfig): void {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isTransitioning = false;

function createSetupWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 420,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: "#0d0b24",
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  win.loadFile(setupHtmlPath);

  win.webContents.on("preload-error", (_event, _path, error) => {
    console.error("Preload error:", error);
  });

  return win;
}

function createMainWindow(url: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0d0b24",
    icon: iconPath,
    title: "AtlasNote",
    frame: false,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Remove the application menu (no traditional menu bar)
  Menu.setApplicationMenu(null);

  win.loadURL(url);

  // Inject the custom title bar after page loads
  win.webContents.on("did-finish-load", () => {
    injectTitleBar(win);
  });

  // Open external links in browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.on("closed", () => {
    mainWindow = null;
    if (!isTransitioning) {
      if (tray) {
        tray.destroy();
        tray = null;
      }
      app.quit();
    }
  });

  return win;
}

function injectTitleBar(win: BrowserWindow): void {
  const css = `
    html, body {
      overflow-x: hidden !important;
    }
    #atlasnote-titlebar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 32px;
      z-index: 99999;
      display: flex;
      align-items: center;
      background: #0d0b24;
      border-bottom: 1px solid #1e1a3a;
      -webkit-app-region: drag;
      user-select: none;
      box-sizing: border-box;
    }
    #atlasnote-titlebar .tb-menu-btn {
      -webkit-app-region: no-drag;
      width: 36px;
      height: 32px;
      border: none;
      background: transparent;
      color: #a8a4b8;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.12s, color 0.12s;
      flex-shrink: 0;
    }
    #atlasnote-titlebar .tb-menu-btn:hover {
      background: rgba(122, 92, 255, 0.15);
      color: #e8e6f0;
    }
    #atlasnote-titlebar .tb-drag {
      flex: 1;
      height: 100%;
    }
    #atlasnote-titlebar .tb-controls {
      display: flex;
      -webkit-app-region: no-drag;
      flex-shrink: 0;
      height: 100%;
    }
    #atlasnote-titlebar .tb-ctrl-btn {
      width: 46px;
      height: 32px;
      border: none;
      background: transparent;
      color: #a8a4b8;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.12s, color 0.12s;
      outline: none;
    }
    #atlasnote-titlebar .tb-ctrl-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #e8e6f0;
    }
    #atlasnote-titlebar .tb-ctrl-btn.tb-close:hover {
      background: #e81123;
      color: #ffffff;
    }
    body {
      padding-top: 32px !important;
      overflow-x: hidden !important;
    }
  `;

  const js = `
    (function() {
      if (document.getElementById('atlasnote-titlebar')) return;
      var style = document.createElement('style');
      style.textContent = ${JSON.stringify(css)};
      document.head.appendChild(style);

      var bar = document.createElement('div');
      bar.id = 'atlasnote-titlebar';

      // Menu button (hamburger)
      var menuBtn = document.createElement('button');
      menuBtn.className = 'tb-menu-btn';
      menuBtn.title = 'Menu';
      menuBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
      menuBtn.addEventListener('click', function() {
        if (window.atlasNote && window.atlasNote.showAppMenu) {
          window.atlasNote.showAppMenu();
        }
      });
      bar.appendChild(menuBtn);

      // Drag spacer
      var drag = document.createElement('div');
      drag.className = 'tb-drag';
      bar.appendChild(drag);

      // Window controls
      var controls = document.createElement('div');
      controls.className = 'tb-controls';

      // Minimize
      var minBtn = document.createElement('button');
      minBtn.className = 'tb-ctrl-btn';
      minBtn.title = 'Minimize';
      minBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 5h8" stroke="currentColor" stroke-width="1"/></svg>';
      minBtn.addEventListener('click', function() {
        if (window.atlasNote) window.atlasNote.minimizeWindow();
      });
      controls.appendChild(minBtn);

      // Maximize
      var maxBtn = document.createElement('button');
      maxBtn.className = 'tb-ctrl-btn';
      maxBtn.title = 'Maximize';
      maxBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" stroke="currentColor" stroke-width="1" fill="none"/></svg>';
      maxBtn.addEventListener('click', function() {
        if (window.atlasNote) window.atlasNote.maximizeWindow();
      });
      controls.appendChild(maxBtn);

      // Close
      var closeBtn = document.createElement('button');
      closeBtn.className = 'tb-ctrl-btn tb-close';
      closeBtn.title = 'Close';
      closeBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1"/></svg>';
      closeBtn.addEventListener('click', function() {
        if (window.atlasNote) window.atlasNote.closeWindow();
      });
      controls.appendChild(closeBtn);

      bar.appendChild(controls);
      document.body.appendChild(bar);
    })();
  `;

  win.webContents.executeJavaScript(js).catch(() => {});
}

function showPopupMenu(): void {
  if (!mainWindow) return;

  const config = loadConfig();
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "Change Server",
      click: () => openSettings(),
    },
    {
      label: "Reload",
      accelerator: "CmdOrCtrl+R",
      click: () => mainWindow?.webContents.reload(),
    },
    { type: "separator" },
    {
      label: "Zoom In",
      accelerator: "CmdOrCtrl+=",
      click: () => {
        if (mainWindow) {
          const zoom = mainWindow.webContents.getZoomLevel();
          mainWindow.webContents.setZoomLevel(zoom + 0.5);
        }
      },
    },
    {
      label: "Zoom Out",
      accelerator: "CmdOrCtrl+-",
      click: () => {
        if (mainWindow) {
          const zoom = mainWindow.webContents.getZoomLevel();
          mainWindow.webContents.setZoomLevel(zoom - 0.5);
        }
      },
    },
    {
      label: "Reset Zoom",
      accelerator: "CmdOrCtrl+0",
      click: () => mainWindow?.webContents.setZoomLevel(0),
    },
    { type: "separator" },
    {
      label: "Start on Login",
      type: "checkbox",
      checked: config.autoStart || false,
      click: (item) => {
        const newConfig = loadConfig();
        newConfig.autoStart = item.checked;
        saveConfig(newConfig);
        app.setLoginItemSettings({ openAtLogin: item.checked });
      },
    },
    { type: "separator" },
    {
      label: `About AtlasNote v${app.getVersion()}`,
      enabled: false,
    },
    {
      label: "Quit",
      accelerator: "CmdOrCtrl+Q",
      click: () => {
        if (tray) {
          tray.destroy();
          tray = null;
        }
        app.quit();
      },
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: mainWindow, x: 0, y: 32 });
}

function createTray(): void {
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show AtlasNote",
      click: () => mainWindow?.show(),
    },
    {
      label: "Change Server",
      click: () => openSettings(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        tray?.destroy();
        tray = null;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("AtlasNote");
  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => mainWindow?.show());
}

function openSettings(): void {
  isTransitioning = true;
  if (mainWindow) {
    mainWindow.destroy();
    mainWindow = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
  mainWindow = createSetupWindow();
  isTransitioning = false;
}

// IPC Handlers
ipcMain.handle("get-server-url", () => {
  return loadConfig().serverUrl;
});

ipcMain.handle("close-window", () => {
  if (mainWindow) {
    mainWindow.destroy();
    mainWindow = null;
  }
  app.quit();
});

ipcMain.handle("save-server-url", (_event, url: string) => {
  const config = loadConfig();
  config.serverUrl = url;
  saveConfig(config);
  return true;
});

ipcMain.handle("test-connection", async (_event, url: string) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return { ok: response.ok, status: response.status };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Connection failed";
    return { ok: false, error: message };
  }
});

ipcMain.handle("connect-to-server", (_event, url: string) => {
  const config = loadConfig();
  config.serverUrl = url;
  saveConfig(config);

  isTransitioning = true;
  if (mainWindow) {
    mainWindow.destroy();
    mainWindow = null;
  }
  mainWindow = createMainWindow(url);
  createTray();
  isTransitioning = false;
});

ipcMain.handle("show-app-menu", () => {
  showPopupMenu();
});

ipcMain.handle("minimize-window", () => {
  mainWindow?.minimize();
});

ipcMain.handle("maximize-window", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

// App lifecycle
app.whenReady().then(() => {
  const config = loadConfig();

  // Apply auto-start setting
  app.setLoginItemSettings({ openAtLogin: config.autoStart || false });

  if (config.serverUrl) {
    mainWindow = createMainWindow(config.serverUrl);
    createTray();
  } else {
    mainWindow = createSetupWindow();
  }
});

app.on("window-all-closed", () => {
  if (!isTransitioning) {
    app.quit();
  }
});

app.on("activate", () => {
  if (!mainWindow) {
    const { serverUrl } = loadConfig();
    if (serverUrl) {
      mainWindow = createMainWindow(serverUrl);
    } else {
      mainWindow = createSetupWindow();
    }
  }
});
