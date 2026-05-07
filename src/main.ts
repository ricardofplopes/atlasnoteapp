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
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0d0b24",
      symbolColor: "#a8a4b8",
      height: 36,
    },
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

  // Inject the floating icon menu button after page loads
  win.webContents.on("did-finish-load", () => {
    injectIconMenu(win);
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

function injectIconMenu(win: BrowserWindow): void {
  const iconDataUri = nativeImage.createFromPath(iconPath)
    .resize({ width: 20, height: 20 })
    .toDataURL();

  const css = `
    #atlasnote-menu-btn {
      position: fixed;
      top: 6px;
      left: 8px;
      z-index: 99999;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: none;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
      -webkit-app-region: no-drag;
      padding: 0;
    }
    #atlasnote-menu-btn:hover {
      background: rgba(122, 92, 255, 0.15);
    }
    #atlasnote-menu-btn:active {
      background: rgba(122, 92, 255, 0.25);
    }
    #atlasnote-menu-btn img {
      width: 18px;
      height: 18px;
      border-radius: 3px;
    }
  `;

  const js = `
    (function() {
      if (document.getElementById('atlasnote-menu-btn')) return;
      var style = document.createElement('style');
      style.textContent = ${JSON.stringify(css)};
      document.head.appendChild(style);
      var btn = document.createElement('button');
      btn.id = 'atlasnote-menu-btn';
      btn.title = 'AtlasNote Menu';
      btn.innerHTML = '<img src="${iconDataUri}" alt="Menu" />';
      btn.addEventListener('click', function() {
        if (window.atlasNote && window.atlasNote.showAppMenu) {
          window.atlasNote.showAppMenu();
        }
      });
      document.body.appendChild(btn);
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
  menu.popup({ window: mainWindow, x: 8, y: 36 });
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
