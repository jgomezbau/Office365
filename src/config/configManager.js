const Store = require('electron-store').default;
const { app } = require('electron');

// Define el esquema para el almacenamiento
class ConfigManager {
  constructor() {
    // Inicializar el almacenamiento persistente
    this.store = new Store({
      defaults: {
        mainUrl: 'https://www.microsoft365.com/?auth=1',
        useragent: '',
        theme: 'system',
        reopenTabsOnLaunch: false,
        tabs: [],
        activeTabId: null,
        recentVisits: []
      },
      name: 'config',
      // Asegurar que la configuración es accesible solo por el usuario actual
      cwd: app ? app.getPath('userData') : undefined,
    });
    
    console.log(`Configuración cargada desde: ${this.store.path}`);
  }

  // Obtener la URL principal
  getMainUrl() {
    return this.store.get('mainUrl');
  }

  // Establecer la URL principal
  setMainUrl(url) {
    this.store.set('mainUrl', url);
  }

  // Obtener todas las pestañas
  getTabs() {
    return this.store.get('tabs', []);
  }

  // Guardar pestañas
  saveTabs(tabs) {
    this.store.set('tabs', Array.isArray(tabs) ? tabs : []);
  }

  // Obtener ID de pestaña activa
  getActiveTabId() {
    return this.store.get('activeTabId', null);
  }

  // Establecer ID de pestaña activa
  setActiveTabId(id) {
    this.store.set('activeTabId', id ?? null);
  }

  getReopenTabsOnLaunch() {
    return this.store.get('reopenTabsOnLaunch', false);
  }

  setReopenTabsOnLaunch(enabled) {
    const normalizedValue = Boolean(enabled);
    this.store.set('reopenTabsOnLaunch', normalizedValue);

    if (!normalizedValue) {
      this.saveTabs([]);
      this.setActiveTabId(null);
    }
  }

  // Obtener tema
  getTheme() {
    return this.store.get('theme', 'system');
  }

  // Establecer tema
  setTheme(theme) {
    this.store.set('theme', theme);
  }

  // Obtener user agent personalizado
  getUserAgent() {
    return this.store.get('useragent', '');
  }

  // Establecer user agent personalizado
  setUserAgent(useragent) {
    this.store.set('useragent', useragent);
  }

  // Limpiar la configuración
  clear() {
    this.store.clear();
  }
}

module.exports = new ConfigManager();
