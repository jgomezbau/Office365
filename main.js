const { app, BrowserWindow, BrowserView, ipcMain, session, Menu, shell, dialog, clipboard, Tray } = require('electron'); // Añadir Tray
const path = require('path');
const configManager = require('./src/config/configManager');
const os = require('os');
const { shouldOpenInternally, debugUrlHandling } = require('./src/utils/urlHandler');
const { getAvailableAppsForFile, downloadAndOpenWithApp, detectFileType } = require('./src/utils/nativeAppHandler');

// Verificar si estamos en desarrollo
const isDev = process.env.IS_DEV === 'true';
let mainWindow;
let tray = null; // Variable para mantener la referencia al Tray

// Objeto para administrar las pestañas
let tabManager = {
  tabs: [],
  activeTabId: null,
  nextTabId: 1,
  // Inicializa el administrador de pestañas
  init: function() {
    // No cargar pestañas guardadas - siempre iniciamos con una limpia
    this.tabs = [];
    this.activeTabId = null;
    this.nextTabId = 1;
    // console.log("TabManager inicializado sin cargar pestañas guardadas");
  },
  // No guardar pestañas entre sesiones
  saveTabs: function() {
    // Intencionalmente vacío - no guardamos las pestañas
    // Siempre queremos empezar con una pestaña limpia
    configManager.saveTabs([]);
    configManager.setActiveTabId(null);
  }
};

// Crea la ventana principal y carga el HTML
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    icon: path.join(__dirname, 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Esto está bien si preload.js está junto a main.js
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
      sandbox: true,
      spellcheck: true,
    },
    titleBarStyle: 'hidden', // Opcional, para macOS
    frame: false,            // <--- Esto es lo importante
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#FFFFFF',
  });

  // Desarrollo: cargar desde servidor Vite
  // Producción: cargar desde el archivo HTML compilado
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    // mainWindow.webContents.openDevTools();
  } else {
    // Corrected path to load from the 'src' directory
    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  }

  // Mostrar la ventana cuando esté lista
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();

    // IMPORTANTE: Limpiar el almacenamiento de pestañas anteriores
    tabManager.tabs = [];
    tabManager.activeTabId = null;
    tabManager.nextTabId = 1;
    configManager.saveTabs([]);
    configManager.setActiveTabId(null);
    // console.log("Limpiando todas las pestañas anteriores");
    const mainUrl = configManager.getMainUrl();
    setTimeout(() => {
      // console.log("Creando pestaña inicial limpia");
      createTab(mainUrl, true);
    }, 100);
  });

  mainWindow.on('resize', () => {
    updateActiveTabBounds();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Modificar el comportamiento al cerrar la ventana
  mainWindow.on('close', (event) => {
    // En lugar de cerrar, ocultar la ventana si el tray está activo
    if (tray && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    } else {
      // Comportamiento normal de cierre si no hay tray o si se está saliendo
      return true;
    }
  });
  
  // Abrir links externos en el navegador predeterminado
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// Función auxiliar para crear un BrowserView
function createBrowserView() {
  const userAgent = configManager.getUserAgent();
  
  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: true,
      // Permitir media
      webSecurity: true,
    },
  });
  
  // Establecer un user agent personalizado si está configurado
  if (userAgent) {
    view.webContents.setUserAgent(userAgent);
  }
  
  // Configurar menú contextual mejorado para enlaces
  view.webContents.on('context-menu', async (event, params) => {
    const menuTemplateItems = [];
    const { linkURL, mediaType, srcURL } = params;
    
    // Opciones generales siempre disponibles
    // Opción para inspeccionar elementos (solo en desarrollo)
    if (isDev) {
      menuTemplateItems.push({
        label: 'Inspeccionar elemento',
        click: () => view.webContents.inspectElement(params.x, params.y)
      });
    }
    
    // Si hay un enlace, agregar opciones específicas para enlaces
    if (linkURL) {
      // IMPORTANTE: Determinar si es un documento/archivo o enlace normal
      const fileType = detectFileType(linkURL);
      const isOfficeFile = !!fileType;
      
      // Siempre abrir en nueva pestaña
      menuTemplateItems.push({
        label: 'Abrir en nueva pestaña',
        click: () => {
          createTab(linkURL, true);
        },
      });
      
      // Si es archivo de Office, agregar opciones para aplicaciones nativas
      if (isOfficeFile) {
        try {
          // Buscar aplicaciones instaladas para este tipo de archivo
          const availableApps = await getAvailableAppsForFile(linkURL);
          
          if (availableApps.length > 0) {
            // Agregar submenú de aplicaciones
            const appMenuItems = availableApps.map(app => ({
              label: `Abrir con ${app.name}`,
              click: () => {
                downloadAndOpenWithApp(linkURL, app.command);
              }
            }));
            
            menuTemplateItems.push({
              label: `Abrir ${fileType} con aplicación`,
              submenu: appMenuItems
            });
          }
        } catch (error) {
          console.error("Error al obtener aplicaciones:", error);
        }
      }
      
      // Opción para abrir en navegador externo
      menuTemplateItems.push({
        label: 'Abrir en navegador externo',
        click: () => {
          shell.openExternal(linkURL);
        },
      });
      
      // Separador y opción para copiar
      menuTemplateItems.push(
        { type: 'separator' },
        {
          label: 'Copiar dirección del enlace',
          click: () => {
            clipboard.writeText(linkURL);
          },
        }
      );
    }
    // Si hay una imagen, agregar opciones para imágenes
    else if (params.mediaType === 'image') {
      menuTemplateItems.push(
        {
          label: 'Copiar imagen',
          click: () => view.webContents.copyImageAt(params.x, params.y)
        },
        {
          label: 'Guardar imagen como...',
          click: () => {
            // Descargar imagen
            view.webContents.downloadURL(params.srcURL);
          }
        }
      );
    }
    // Opciones básicas de página
    else {
      menuTemplateItems.push(
        {
          label: 'Recargar página',
          click: () => view.webContents.reload()
        },
        { type: 'separator' },
        {
          label: 'Copiar',
          click: () => view.webContents.copy(),
          enabled: params.editFlags.canCopy
        },
        {
          label: 'Pegar',
          click: () => view.webContents.paste(),
          enabled: params.editFlags.canPaste
        }
      );
    }
    
    // Mostrar el menú contextual
    const menu = Menu.buildFromTemplate(menuTemplateItems);
    menu.popup();
  });
  
  return view;
}

// Actualiza el área de la pestaña activa según el tamaño de la ventana
function updateActiveTabBounds() {
  if (mainWindow && tabManager.activeTabId) {
    let activeTab = tabManager.tabs.find(tab => tab.id === tabManager.activeTabId);
    if (activeTab) {
      let bounds = mainWindow.getContentBounds();
      const tabBarHeight = 48; // Altura actualizada para la barra de pestañas moderna
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
  if (!mainWindow) return null;

  // console.log(`Creando nueva pestaña con URL: ${url}, makeActive: ${makeActive}`);
  
  const view = createBrowserView();

  let bounds = mainWindow.getContentBounds();
  const tabBarHeight = 48; // Altura actualizada para la barra moderna
  view.setBounds({
    x: 0,
    y: tabBarHeight,
    width: bounds.width,
    height: bounds.height - tabBarHeight,
  });
  
  // Asignar ID de pestaña primero
  const tabId = tabManager.nextTabId++;
  
  // Crear el objeto de pestaña
  const tab = { 
    id: tabId, 
    view, 
    url, 
    title: url 
  };
  
  // Añadir a la lista de pestañas
  tabManager.tabs.push(tab);
  
  // Si es la pestaña activa, ponerla en primer plano inmediatamente
  if (makeActive) {
    // console.log(`Activando pestaña ${tabId} inmediatamente`);
    switchTab(tabId);
  }
  
  // Cargar la URL
  view.webContents.loadURL(url);
  
  // Intercepta eventos de navegación
  view.webContents.on('will-navigate', (event, navigationUrl) => {
    const currentURL = view.webContents.getURL();
    
    try {
      // Si navegamos desde una URL interna a una externa, cancelar y abrir en navegador
      if (shouldOpenInternally(currentURL) && !shouldOpenInternally(navigationUrl)) {
        event.preventDefault();
        shell.openExternal(navigationUrl);
        showWebNotification('Abriendo enlace externo en el navegador');
      }
    } catch (error) {
      // console.error('Error en navegación:', error);
    }
  });
  
  // Interceptamos la actualización del título para mostrar solo la parte anterior al guion (-)
  view.webContents.on('page-title-updated', (event, title) => {
    let shortTitle = title.split(' - ')[0];
    tab.title = shortTitle;
    sendTabsUpdate();
  });
  
  // Actualizar pestañas después de cargar
  view.webContents.on('did-finish-load', () => {
    // console.log(`Pestaña ${tabId} cargada: ${view.webContents.getTitle()}`);
    
    // Si esta pestaña debe ser activa, asegurarse de activarla de nuevo
    if (makeActive && tabManager.activeTabId === tabId) {
      // console.log(`Reactivando pestaña ${tabId} después de cargar`);
      mainWindow.addBrowserView(view);
      updateActiveTabBounds();
      sendTabsUpdate();
    }
  });
  
  // Intercepta nuevos popups para que se abran como pestañas
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldOpenInternally(url)) {
      // console.log('Abriendo internamente:', url);
      createTab(url, true);
      return { action: 'deny' };
    }
    
    // Abrir links externos en navegador predeterminado
    // console.log('Abriendo externamente:', url);
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // No guardamos el estado de pestañas entre sesiones
  sendTabsUpdate();
  
  return tab;
}

// Cambia la pestaña activa
function switchTab(tabId) {
  // console.log(`Cambiando a pestaña: ${tabId}`);
  
  if (tabManager.activeTabId) {
    let current = tabManager.tabs.find(tab => tab.id === tabManager.activeTabId);
    if (current) {
      // console.log(`Quitando pestaña actual: ${tabManager.activeTabId}`);
      mainWindow.removeBrowserView(current.view);
    }
  }
  
  tabManager.activeTabId = tabId;
  let newActive = tabManager.tabs.find(tab => tab.id === tabId);
  
  if (newActive) {
    // console.log(`Añadiendo nueva pestaña activa: ${tabId}`);
    mainWindow.addBrowserView(newActive.view);
    updateActiveTabBounds();
  } else {
    // console.warn(`No se encontró la pestaña ${tabId}`);
  }
  
  // Guardar pestaña activa
  configManager.setActiveTabId(tabId);
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
    
    // Si no quedan pestañas, crear una nueva
    if (tabManager.tabs.length === 0) {
      const mainUrl = configManager.getMainUrl();
      createTab(mainUrl, true);
    }
    
    // No guardamos pestañas entre sesiones
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

ipcMain.on('window-control', (event, action) => {
  if (!mainWindow) return;
  switch (action) {
    case 'minimize':
      mainWindow.minimize();
      break;
    case 'maximize':
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
      break;
    case 'close':
      mainWindow.close();
      break;
  }
});

// Gestión de configuración
ipcMain.handle('get-main-url', () => {
  return configManager.getMainUrl();
});

ipcMain.handle('set-main-url', (event, url) => {
  configManager.setMainUrl(url);
  return true;
});

ipcMain.handle('get-user-agent', () => {
  return configManager.getUserAgent();
});

ipcMain.handle('set-user-agent', (event, userAgent) => {
  configManager.setUserAgent(userAgent);
  return true;
});

ipcMain.handle('get-theme', () => {
  return configManager.getTheme();
});

ipcMain.handle('set-theme', (event, theme) => {
  configManager.setTheme(theme);
  return true;
});

// Obtener versión de la aplicación
ipcMain.handle('get-version', () => {
  return app.getVersion();
});

// Función para mostrar notificaciones en la interfaz web
function showWebNotification(message, type = 'info') {
  if (mainWindow) {
    mainWindow.webContents.send('show-notification', { message, type });
  }
}

// Crear el icono de la bandeja del sistema
function createTray() {
  const iconPath = path.join(__dirname, 'icons', 'icon.png'); // Asegúrate que la ruta al icono es correcta
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Mostrar/Ocultar',
      click: () => {
        if (mainWindow) {
          mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
        }
      }
    },
    {
      label: 'Recargar App',
      click: () => {
        if (mainWindow) {
          mainWindow.reload();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        app.isQuitting = true; // Marcar que se está saliendo intencionadamente
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Microsoft 365 Copilot');
  tray.setContextMenu(contextMenu);

  // Opcional: Abrir la ventana al hacer clic en el icono del tray
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show();
    }
  });
}

// Iniciar la aplicación una vez que esté lista
app.whenReady().then(() => {
  // Configurar permisos para medios (cámara, micrófono)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'notifications', 'clipboard-read', 'fullscreen'];
    callback(allowedPermissions.includes(permission));
  });
  
  // Interceptar clicks en links para decidir dónde abrirlos
  session.defaultSession.webRequest.onBeforeRequest({
    urls: ['*://*/*']
  }, (details, callback) => {
    // Solo procesar solicitudes iniciadas por usuario (clic en enlace)
    if (details.resourceType === 'mainFrame' && details.method === 'GET') {
      const url = details.url;
      
      // Verificar si el enlace debe abrirse internamente o externamente
      if (!shouldOpenInternally(url)) {
        // Cancelar la solicitud y abrir externamente
        shell.openExternal(url);
        callback({ cancel: true });
        return;
      }
    }
    
    // Permitir la solicitud normalmente
    callback({ cancel: false });
  });

  createMainWindow();
  createTray(); // Crear el icono del tray
  
  // Registrar protocolo deep-link personalizado (ms365://)
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('ms365', process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient('ms365');
  }
  
  // Mostrar información de configuración en la consola (solo en desarrollo)
  if (isDev) {
    // console.log('Información de la aplicación:');
    // console.log(`- Sistema: ${os.platform()} ${os.release()} (${os.arch()})`);
    // console.log(`- Node.js: ${process.versions.node}`);
    // console.log(`- Electron: ${process.versions.electron}`);
    // console.log(`- Modo: ${isDev ? 'Desarrollo' : 'Producción'}`);
    // console.log(`- Directorio de datos: ${app.getPath('userData')}`);
  }
});

// Manejar el evento before-quit para asegurar la salida correcta
app.on('before-quit', () => {
  app.isQuitting = true;
});

// Solo en macOS: volver a crear ventana al hacer clic en el dock
app.on('activate', () => {
  // Si no hay ventanas abiertas y el dock es clickeado, mostrar la ventana principal
  if (BrowserWindow.getAllWindows().length === 0) {
     if (mainWindow) {
       mainWindow.show();
     } else {
       createMainWindow();
     }
  } else if (mainWindow) {
     mainWindow.show(); // Asegura que la ventana se muestre si estaba oculta
  }
});

// Cerrar la aplicación solo si no estamos en macOS o si se fuerza la salida
app.on('window-all-closed', () => {
  // En macOS, la aplicación generalmente permanece activa hasta que el usuario la cierra explícitamente
  if (process.platform !== 'darwin') {
    app.quit();
  }
});