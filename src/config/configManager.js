const fs = require('fs');
const os = require('os');
const path = require('path');
const Store = require('electron-store').default;
const { app } = require('electron');

// Define el esquema para el almacenamiento
class ConfigManager {
  constructor() {
    const userDataPath = this.resolveUserDataPath();

    // Inicializar el almacenamiento persistente
    this.store = new Store({
      projectName: 'o365linuxdesktop',
      defaults: {
        mainUrl: 'https://www.microsoft365.com/?auth=1',
        useragent: '',
        theme: 'system',
        reopenTabsOnLaunch: false,
        tabs: [],
        activeTabId: null,
        recentVisits: [],
        favorites: [],
        windowBounds: null,
        windowMaximized: true
      },
      name: 'config',
      // Asegurar que la configuración es accesible solo por el usuario actual
      cwd: userDataPath,
    });

  }

  resolveUserDataPath() {
    const candidates = [];

    if (app?.getPath) {
      try {
        const electronUserDataPath = app.getPath('userData');
        if (electronUserDataPath) {
          candidates.push(electronUserDataPath);
        }
      } catch (error) {
        // Puede no estar disponible todavía durante el arranque temprano.
      }
    }

    const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    candidates.push(path.join(configHome, 'o365linuxdesktop-nodejs'));
    candidates.push(path.join(process.cwd(), '.o365linuxdesktop-data'));

    for (const candidate of candidates) {
      try {
        fs.mkdirSync(candidate, { recursive: true });
        return candidate;
      } catch (error) {
        // Probar el siguiente candidato.
      }
    }

    return path.join(process.cwd(), '.o365linuxdesktop-data');
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

  getFavorites() {
    return this.store.get('favorites', []);
  }

  setFavorites(favorites) {
    this.store.set('favorites', Array.isArray(favorites) ? favorites : []);
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

  getWindowBounds() {
    return this.store.get('windowBounds', null);
  }

  setWindowBounds(bounds) {
    if (!bounds || typeof bounds !== 'object') {
      this.store.set('windowBounds', null);
      return;
    }

    this.store.set('windowBounds', {
      x: Number(bounds.x),
      y: Number(bounds.y),
      width: Number(bounds.width),
      height: Number(bounds.height)
    });
  }

  getWindowMaximized() {
    return this.store.get('windowMaximized', true);
  }

  setWindowMaximized(maximized) {
    this.store.set('windowMaximized', Boolean(maximized));
  }

  // Limpiar la configuración
  clear() {
    this.store.clear();
  }
}

module.exports = new ConfigManager();
