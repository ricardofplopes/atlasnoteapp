import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("atlasNote", {
  getServerUrl: () => ipcRenderer.invoke("get-server-url"),
  saveServerUrl: (url: string) => ipcRenderer.invoke("save-server-url", url),
  testConnection: (url: string) => ipcRenderer.invoke("test-connection", url),
  connectToServer: (url: string) => ipcRenderer.invoke("connect-to-server", url),
  closeWindow: () => ipcRenderer.invoke("close-window"),
});
