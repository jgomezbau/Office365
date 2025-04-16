/**
 * Preload script para Microsoft 365 Copilot
 * Configura un puente seguro entre el proceso principal y el proceso de renderizado
 */

const { contextBridge, ipcRenderer } = require('electron');

// Exponemos una API segura para el renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Gestión de pestañas
  createTab: (url) => ipcRenderer.send('create-tab', url),
  switchTab: (tabId) => ipcRenderer.send('switch-tab', tabId),
  closeTab: (tabId) => ipcRenderer.send('close-tab', tabId),
  reloadTab: (tabId) => ipcRenderer.send('reload-tab', tabId),
  onTabsUpdated: (callback) => {
    ipcRenderer.on('tabs-updated', (event, data) => callback(data));
    // Devolver función para eliminar listener cuando sea necesario
    return () => ipcRenderer.removeListener('tabs-updated', callback);
  },
  
  // Configuración
  getMainUrl: () => ipcRenderer.invoke('get-main-url'),
  setMainUrl: (url) => ipcRenderer.invoke('set-main-url', url),
  getUserAgent: () => ipcRenderer.invoke('get-user-agent'),
  setUserAgent: (userAgent) => ipcRenderer.invoke('set-user-agent', userAgent),
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  
  // Sistema
  getVersion: () => ipcRenderer.invoke('get-version'),
  platformInfo: () => {
    return {
      platform: process.platform,
      arch: process.arch,
      versions: {
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome
      }
    };
  },
  
  // Utilidades
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  
  // Notificaciones
  onNotification: (callback) => {
    ipcRenderer.on('show-notification', (event, data) => callback(data));
    return () => ipcRenderer.removeListener('show-notification', callback);
  },

  // Control de ventana
  windowControl: (action) => ipcRenderer.send('window-control', action),
});