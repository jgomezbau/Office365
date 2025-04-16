const Store = require('electron-store');
const { app } = require('electron');

// Define el esquema para el almacenamiento
class ConfigManager {
  constructor() {
    // Inicializar el almacenamiento persistente
    this.store = new Store({
      defaults: {
        mainUrl: 'https://m365.cloud.microsoft/?auth=2',
        useragent: '',
        theme: 'system',
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
    // Siempre retornar un array vacío para no cargar pestañas guardadas
    return [];
  }

  // Guardar pestañas
  saveTabs(tabs) {
    // Siempre guardar un array vacío para que no persistan pestañas
    this.store.set('tabs', []);
  }

  // Obtener ID de pestaña activa
  getActiveTabId() {
    // Siempre retornar null para forzar la creación de una nueva pestaña
    return null;
  }

  // Establecer ID de pestaña activa
  setActiveTabId(id) {
    // Guardar null para que no persista entre sesiones
    this.store.set('activeTabId', null);
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