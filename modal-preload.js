const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('modalAPI', {
  getState: () => ipcRenderer.invoke('floating-modal:get-state'),
  onState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('floating-modal-state', handler);
    return () => ipcRenderer.removeListener('floating-modal-state', handler);
  },
  close: () => ipcRenderer.send('close-floating-modal'),
  notify: (message, type = 'info') => ipcRenderer.send('floating-modal:notify', { message, type }),
  tabInfoHover: (inside) => ipcRenderer.send('floating-tab-info:hover', { inside }),
  toggleTabInfoFavorite: (tabId) => ipcRenderer.send('floating-tab-info:toggle-favorite', { tabId }),
  detachTabToWindow: (tabId) => ipcRenderer.send('floating-tab-info:detach', { tabId }),
  createTab: (url) => ipcRenderer.send('create-tab', url),
  openUrlInActiveTab: (url) => ipcRenderer.send('open-url-in-active-tab', url),
  getMainUrl: () => ipcRenderer.invoke('get-main-url'),
  setMainUrl: (url) => ipcRenderer.invoke('set-main-url', url),
  getUserAgent: () => ipcRenderer.invoke('get-user-agent'),
  setUserAgent: (value) => ipcRenderer.invoke('set-user-agent', value),
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  getReopenTabsOnLaunch: () => ipcRenderer.invoke('get-reopen-tabs-on-launch'),
  setReopenTabsOnLaunch: (enabled) => ipcRenderer.invoke('set-reopen-tabs-on-launch', enabled)
});
