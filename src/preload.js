const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  createTab: (url) => ipcRenderer.send('create-tab', url),
  switchTab: (tabId) => ipcRenderer.send('switch-tab', tabId),
  closeTab: (tabId) => ipcRenderer.send('close-tab', tabId),
  reloadTab: (tabId) => ipcRenderer.send('reload-tab', tabId),
  onTabsUpdated: (callback) =>
    ipcRenderer.on('tabs-updated', (event, data) => callback(data)),
  getMainUrl: () => ipcRenderer.invoke('get-main-url')
});
