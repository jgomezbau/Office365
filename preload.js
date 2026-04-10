/**
 * Preload script para O365 Linux Desktop
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
  reorderTabs: (orderedIds) => ipcRenderer.send('reorder-tabs', orderedIds),
  detachTabToWindow: (tabId) => ipcRenderer.send('detach-tab-to-window', tabId),
  toggleFloatingModal: (config) => ipcRenderer.send('toggle-floating-modal', config),
  openFloatingModal: (config) => ipcRenderer.send('open-floating-modal', config),
  closeFloatingModal: () => ipcRenderer.send('close-floating-modal'),
  showTabDragGhost: (payload) => ipcRenderer.send('show-tab-drag-ghost', payload),
  moveTabDragGhost: (payload) => ipcRenderer.send('move-tab-drag-ghost', payload),
  hideTabDragGhost: () => ipcRenderer.send('hide-tab-drag-ghost'),
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
  getReopenTabsOnLaunch: () => ipcRenderer.invoke('get-reopen-tabs-on-launch'),
  setReopenTabsOnLaunch: (enabled) => ipcRenderer.invoke('set-reopen-tabs-on-launch', enabled),
  
  // Sistema
  getVersion: () => ipcRenderer.invoke('get-version'),
  
  // Notificaciones
  onNotification: (callback) => {
    ipcRenderer.on('show-notification', (event, data) => callback(data));
    return () => ipcRenderer.removeListener('show-notification', callback);
  },
  onTabInfoHoverState: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('tab-info-hover-state', handler);
    return () => ipcRenderer.removeListener('tab-info-hover-state', handler);
  },
  onTabInfoFavoriteToggle: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('tab-info-favorite-toggle', handler);
    return () => ipcRenderer.removeListener('tab-info-favorite-toggle', handler);
  },

  // Control de ventana
  windowControl: (action) => ipcRenderer.send('window-control', action),
  toggleMaximize: () => ipcRenderer.invoke('toggle-maximize'),

  // Navegación de pestañas
  openUrlInActiveTab: (url) => ipcRenderer.send('open-url-in-active-tab', url),
});
