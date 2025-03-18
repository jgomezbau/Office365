const { app, BrowserWindow, BrowserView, ipcMain, session, Menu, dialog } = require('electron');
const path = require('path');
const configManager = require('./src/config');

let mainWindow;

// Objeto para administrar las pestañas
let tabManager = {
  tabs: [],
  activeTabId: null,
  nextTabId: 1,
};

// Crea la ventana principal y carga el HTML (barra de pestañas)
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
    },
  });

  // Quitar el menú superior y el menú de la aplicación
  mainWindow.setMenu(null);
  Menu.setApplicationMenu(null);

  // Maximizar la ventana al iniciar
  mainWindow.maximize();

  // Cargar la interfaz (barra de pestañas) desde la carpeta src
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Obtener la URL principal desde la configuración
  const mainUrl = configManager.getMainUrl();
  console.log(`Iniciando aplicación con URL: ${mainUrl}`);
  
  // Crear la pestaña inicial con la URL de Microsoft 365® Copilot  Web desde la configuración
  createTab(mainUrl, true);

  mainWindow.on('resize', () => {
    updateActiveTabBounds();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Actualiza el área de la pestaña activa según el tamaño de la ventana
function updateActiveTabBounds() {
  if (mainWindow && tabManager.activeTabId) {
    let activeTab = tabManager.tabs.find(tab => tab.id === tabManager.activeTabId);
    if (activeTab) {
      let bounds = mainWindow.getContentBounds();
      const tabBarHeight = 40; // Altura reservada para la barra de pestañas
      activeTab.view.setBounds({
        x: 0,
        y: tabBarHeight,
        width: bounds.width,
        height: bounds.height - tabBarHeight,
      });
    }
  }
}

// Crea una nueva pestaña (BrowserView) con la URL indicada
function createTab(url, makeActive = false) {
  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true,
    },
  });

  let bounds = mainWindow.getContentBounds();
  const tabBarHeight = 40;
  view.setBounds({
    x: 0,
    y: tabBarHeight,
    width: bounds.width,
    height: bounds.height - tabBarHeight,
  });
  view.setAutoResize({ width: true, height: true });
  view.webContents.loadURL(url);

  // Al terminar de cargar, actualizamos los límites para maximizar el contenido
  view.webContents.on('did-finish-load', () => {
    updateActiveTabBounds();
  });

  let tabId = tabManager.nextTabId++;
  let tab = { id: tabId, view, url, title: url };
  tabManager.tabs.push(tab);

  // Interceptamos la actualización del título para mostrar solo la parte anterior al guion (-)
  view.webContents.on('page-title-updated', (event, title) => {
    let shortTitle = title.split(' - ')[0];
    tab.title = shortTitle;
    sendTabsUpdate();
  });

  // Intercepta nuevos popups para que se abran como pestañas
  view.webContents.setWindowOpenHandler(({ url }) => {
    createTab(url, true);
    return { action: 'deny' };
  });

  if (makeActive) {
    switchTab(tabId);
  }

  sendTabsUpdate();
  return tab;
}

// Cambia la pestaña activa
function switchTab(tabId) {
  if (tabManager.activeTabId) {
    let current = tabManager.tabs.find(tab => tab.id === tabManager.activeTabId);
    if (current) mainWindow.removeBrowserView(current.view);
  }
  tabManager.activeTabId = tabId;
  let newActive = tabManager.tabs.find(tab => tab.id === tabId);
  if (newActive) {
    mainWindow.addBrowserView(newActive.view);
    updateActiveTabBounds();
  }
  sendTabsUpdate();
}

// Cierra una pestaña y, si es la activa, cambia a otra
function closeTab(tabId) {
  let index = tabManager.tabs.findIndex(tab => tab.id === tabId);
  if (index !== -1) {
    let tab = tabManager.tabs[index];
    if (tabManager.activeTabId === tabId) {
      let newIndex = index === 0 ? 1 : index - 1;
      if (tabManager.tabs[newIndex]) {
        switchTab(tabManager.tabs[newIndex].id);
      } else {
        tabManager.activeTabId = null;
      }
    }
    tab.view.webContents.destroy();
    tabManager.tabs.splice(index, 1);
    sendTabsUpdate();
  }
}

// Recarga la pestaña especificada
function reloadTab(tabId) {
  let tab = tabManager.tabs.find(tab => tab.id === tabId);
  if (tab) {
    tab.view.webContents.reload();
  }
}

// Envía al renderer la información actualizada de las pestañas para actualizar la UI
function sendTabsUpdate() {
  if (mainWindow) {
    let tabsForUI = tabManager.tabs.map(tab => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
    }));
    mainWindow.webContents.send('tabs-updated', { tabs: tabsForUI, activeTabId: tabManager.activeTabId });
  }
}

// Compartir la URL principal con el renderer a través de IPC
ipcMain.handle('get-main-url', () => {
  return configManager.getMainUrl();
});

// Configuración de los IPC handlers
ipcMain.on('create-tab', (event, url) => {
  createTab(url, true);
});
ipcMain.on('switch-tab', (event, tabId) => {
  switchTab(tabId);
});
ipcMain.on('close-tab', (event, tabId) => {
  closeTab(tabId);
});
ipcMain.on('reload-tab', (event, tabId) => {
  reloadTab(tabId);
});

// Iniciar la aplicación una vez que esté lista
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media'];
    callback(allowedPermissions.includes(permission));
  });

  createMainWindow();
  
  // Mostrar información de configuración en la consola
  console.log('Información de configuración:');
  console.log(`- Modo: ${app.isPackaged ? 'Producción' : 'Desarrollo'}`);
  console.log(`- Ruta de la aplicación: ${app.getAppPath()}`);
  console.log(`- Directorio de datos: ${app.getPath('userData')}`);
  console.log(`- Archivo de configuración: ${configManager.getConfigPath()}`);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createMainWindow();
});