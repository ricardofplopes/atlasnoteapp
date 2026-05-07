import { app, BrowserWindow, ipcMain, Menu, Tray, shell, nativeImage } from "electron";
import * as path from "path";
import * as fs from "fs";

interface AppConfig {
  serverUrl: string;
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
  return { serverUrl: "" };
}

function saveConfig(config: AppConfig): void {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isConnecting = false;

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

  // Log preload errors
  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error("Preload error:", preloadPath, error);
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
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  win.loadURL(url);

  // Open external links in browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.on("closed", () => {
    mainWindow = null;
    if (tray) {
      tray.destroy();
      tray = null;
    }
    app.quit();
  });

  return win;
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
      label: "Settings",
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

function createAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "AtlasNote",
      submenu: [
        {
          label: "Settings",
          accelerator: "CmdOrCtrl+,",
          click: () => openSettings(),
        },
        { type: "separator" },
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+R",
          click: () => mainWindow?.webContents.reload(),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "zoomIn" },
        { role: "zoomOut" },
        { role: "resetZoom" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { type: "separator" },
        { role: "toggleDevTools" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function openSettings(): void {
  if (mainWindow) {
    mainWindow.destroy();
    mainWindow = null;
  }
  mainWindow = createSetupWindow();
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
  saveConfig({ serverUrl: url });
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
  saveConfig({ serverUrl: url });
  isConnecting = true;
  if (mainWindow) {
    mainWindow.destroy();
    mainWindow = null;
  }
  mainWindow = createMainWindow(url);
  createTray();
  createAppMenu();
  isConnecting = false;
});

// App lifecycle
app.whenReady().then(() => {
  const { serverUrl } = loadConfig();

  if (serverUrl) {
    mainWindow = createMainWindow(serverUrl);
    createTray();
    createAppMenu();
  } else {
    mainWindow = createSetupWindow();
  }
});

app.on("window-all-closed", () => {
  if (!isConnecting) {
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
