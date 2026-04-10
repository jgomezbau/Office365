const { app, BrowserWindow, BrowserView, ipcMain, session, Menu, shell, dialog, clipboard, Tray, desktopCapturer } = require('electron'); // Añadir Tray
const path = require('path');
const configManager = require('./src/config/configManager');
const os = require('os');
const { shouldOpenInternally } = require('./src/utils/urlHandler');
const { getAvailableAppsForFile, downloadAndOpenWithApp, detectFileType } = require('./src/utils/nativeAppHandler');

// Verificar si estamos en desarrollo
const isDev = process.env.IS_DEV === 'true';
const APP_SESSION_PARTITION = 'persist:office365';
const FIREFOX_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0';
let mainWindow;
let tray = null; // Variable para mantener la referencia al Tray
const popupWindows = new Set();

function logPrimaryFlow(label, payload) {
  console.log(`[PRIMARY][${label}]`, payload);
}

function getAccountModeFromMainUrl(url) {
  const normalizedUrl = (url || '').trim().toLowerCase();

  if (!normalizedUrl) return 'corporate';
  if (normalizedUrl.includes('auth=1')) return 'personal';
  if (normalizedUrl.includes('auth=2')) return 'corporate';
  if (normalizedUrl.includes('outlook.live.com') || normalizedUrl.includes('office.live.com')) return 'personal';
  if (normalizedUrl.includes('outlook.office.com')) return 'corporate';

  return 'corporate';
}

function getPreferredOutlookUrl() {
  const accountMode = getAccountModeFromMainUrl(configManager.getMainUrl());
  return accountMode === 'personal'
    ? 'https://outlook.live.com/mail/'
    : 'https://outlook.office.com/mail/';
}

function getPreferredTeamsUrl(rawUrl = '') {
  const accountMode = getAccountModeFromMainUrl(configManager.getMainUrl());

  if (accountMode === 'personal') {
    return 'https://teams.live.com/v2/?utm_source=OfficeWeb';
  }

  try {
    const parsedUrl = new URL(rawUrl);
    const loginHintSafe = parsedUrl.searchParams.get('login_hint_safe');
    const targetUrl = new URL('https://teams.microsoft.com/v2/');

    targetUrl.searchParams.set('lm', 'deeplink');
    targetUrl.searchParams.set('lmsrc', 'officeWaffle');

    if (loginHintSafe) {
      targetUrl.searchParams.set('login_hint_safe', loginHintSafe);
    }

    return targetUrl.toString();
  } catch (error) {
    return 'https://teams.microsoft.com/v2/?lm=deeplink&lmsrc=officeWaffle';
  }
}

function getPreferredOneDriveUrl() {
  const accountMode = getAccountModeFromMainUrl(configManager.getMainUrl());
  return accountMode === 'personal'
    ? 'https://onedrive.live.com/?gologin=1&view=1'
    : 'https://www.microsoft365.com/launch/onedrive';
}

function getPreferredOneNoteUrl() {
  return 'https://www.onenote.com/notebooks';
}

function getPreferredSharePointUrl() {
  return 'https://www.microsoft365.com/launch/sharepoint';
}

function isOfficeDocumentUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;

  try {
    const parsedUrl = new URL(rawUrl);
    const host = parsedUrl.hostname.toLowerCase();
    const path = parsedUrl.pathname.toLowerCase();
    const search = parsedUrl.search.toLowerCase();

    if (isOfficeAppLaunchUrl(rawUrl)) {
      return false;
    }

    const hasOfficeExtension = [
      '.doc', '.docx', '.dot', '.dotx',
      '.xls', '.xlsx', '.xlsm', '.xltx',
      '.ppt', '.pptx', '.pot', '.potx',
      '.pdf'
    ].some((extension) => path.endsWith(extension));

    const isWopiDocumentFlow =
      path.includes('/_layouts/15/wopiframe.aspx') ||
      path.includes('/_layouts/15/doc.aspx') ||
      path.includes('/_layouts/15/guestaccess.aspx');

    const hasDocumentMarkers =
      path.includes('/:w:/') ||
      path.includes('/:x:/') ||
      path.includes('/:p:/') ||
      search.includes('sourcedoc=') ||
      search.includes('mobileredirect=true');

    const isDocumentViewerRoute =
      (
        host.includes('word.cloud.microsoft') ||
        host.includes('excel.cloud.microsoft') ||
        host.includes('powerpoint.cloud.microsoft') ||
        host.includes('word-edit.officeapps.live.com') ||
        host.includes('excel.officeapps.live.com') ||
        host.includes('powerpoint.officeapps.live.com') ||
        host.includes('officeapps.live.com')
      ) &&
      (
        search.includes('sourcedoc=') ||
        path.includes('/we/') ||
        path.includes('/wv/') ||
        path.includes('/x/_layouts/') ||
        path.includes('/p/_layouts/')
      );

    return hasOfficeExtension || isWopiDocumentFlow || hasDocumentMarkers || isDocumentViewerRoute;
  } catch (error) {
    return false;
  }
}

function openManagedPopupWindow(url, partition = APP_SESSION_PARTITION) {
  if (!url || url === 'about:blank') return null;

  const popupWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: true,
    autoHideMenuBar: true,
    backgroundColor: '#FFFFFF',
    icon: path.join(__dirname, 'icons', 'icon.png'),
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      nativeWindowOpen: true
    }
  });

  popupWindow.webContents.setUserAgent(getEffectiveUserAgent());
  popupWindow.setMenuBarVisibility(false);
  trackPopupWindow(popupWindow);
  popupWindow.loadURL(url);

  return popupWindow;
}

function openTrayAppWindow(appKey) {
  let targetUrl = null;

  switch (appKey) {
    case 'word':
      targetUrl = normalizeInternalAppUrl('https://www.microsoft365.com/launch/word');
      break;
    case 'excel':
      targetUrl = normalizeInternalAppUrl('https://www.microsoft365.com/launch/excel');
      break;
    case 'powerpoint':
      targetUrl = normalizeInternalAppUrl('https://www.microsoft365.com/launch/powerpoint');
      break;
    case 'outlook':
      targetUrl = getPreferredOutlookUrl();
      break;
    case 'onedrive':
      targetUrl = getPreferredOneDriveUrl();
      break;
    case 'teams':
      targetUrl = getPreferredTeamsUrl();
      break;
    case 'onenote':
      targetUrl = getPreferredOneNoteUrl();
      break;
    default:
      return null;
  }

  return openManagedPopupWindow(targetUrl, APP_SESSION_PARTITION);
}

function isOfficeAppLaunchUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;

  try {
    const parsedUrl = new URL(rawUrl);
    const host = parsedUrl.hostname.toLowerCase();
    const path = parsedUrl.pathname.toLowerCase();

    const isTeamsHost =
      host === 'teams.microsoft.com' ||
      host.endsWith('.teams.microsoft.com') ||
      host === 'teams.live.com' ||
      host.endsWith('.teams.live.com') ||
      host === 'teams.cloud.microsoft' ||
      host.endsWith('.teams.cloud.microsoft');

    return (
      (host === 'www.microsoft365.com' && (
        path === '/launch/outlook' ||
        path === '/launch/teams' ||
        path === '/launch/onedrive' ||
        path === '/launch/onenote' ||
        path === '/launch/sharepoint'
      )) ||
      (host === 'aka.ms' && path === '/mstfw') ||
      (host === 'office.live.com' && (
        path === '/start/outlook.aspx' ||
        path === '/start/teams.aspx' ||
        path === '/start/onedrive.aspx' ||
        path === '/start/onenote.aspx' ||
        path === '/start/sharepoint.aspx'
      )) ||
      host.includes('outlook.office.com') ||
      host.includes('outlook.live.com') ||
      isTeamsHost ||
      host.includes('onenote.com') ||
      host.includes('sharepoint.com')
    );
  } catch (error) {
    return false;
  }
}

function normalizeInternalAppUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;

  try {
    const parsedUrl = new URL(rawUrl);
    const host = parsedUrl.hostname.toLowerCase();
    const path = parsedUrl.pathname.toLowerCase();

    const isOutlookLauncherUrl =
      (host === 'www.microsoft365.com' && path === '/launch/outlook') ||
      (host === 'office.live.com' && path === '/start/outlook.aspx');

    const isTeamsLauncherUrl =
      (host === 'www.microsoft365.com' && path === '/launch/teams') ||
      (host === 'aka.ms' && path === '/mstfw') ||
      (host === 'office.live.com' && path === '/start/teams.aspx') ||
      host === 'teams.microsoft.com' ||
      host.endsWith('.teams.microsoft.com') ||
      host === 'teams.live.com' ||
      host.endsWith('.teams.live.com') ||
      host === 'teams.cloud.microsoft' ||
      host.endsWith('.teams.cloud.microsoft');

    const isOneDriveLauncherUrl =
      (host === 'www.microsoft365.com' && path === '/launch/onedrive') ||
      (host === 'office.live.com' && path === '/start/onedrive.aspx');

    const isOneNoteLauncherUrl =
      (host === 'www.microsoft365.com' && path === '/launch/onenote') ||
      (host === 'office.live.com' && path === '/start/onenote.aspx') ||
      host.includes('onenote.com');

    const isSharePointLauncherUrl =
      (host === 'www.microsoft365.com' && path === '/launch/sharepoint') ||
      (host === 'office.live.com' && path === '/start/sharepoint.aspx');

    if (isOutlookLauncherUrl) {
      return getPreferredOutlookUrl();
    }

    if (isTeamsLauncherUrl) {
      return getPreferredTeamsUrl(rawUrl);
    }

    if (isOneDriveLauncherUrl) {
      return getPreferredOneDriveUrl();
    }

    if (isOneNoteLauncherUrl) {
      return getPreferredOneNoteUrl();
    }

    if (isSharePointLauncherUrl) {
      return getPreferredSharePointUrl();
    }

    return rawUrl;
  } catch (error) {
    return rawUrl;
  }
}

function shouldAllowNativePopup(url) {
  if (!url || typeof url !== 'string') return false;

  try {
    const { hostname, pathname, search } = new URL(url);
    const lowerHost = hostname.toLowerCase();
    const lowerPath = pathname.toLowerCase();
    const lowerSearch = search.toLowerCase();

    const isMicrosoftAuthHost =
      lowerHost.includes('login.microsoftonline.com') ||
      lowerHost.includes('login.live.com') ||
      lowerHost.includes('oauth') ||
      lowerHost.includes('msauth.net') ||
      lowerHost.includes('msftauth.net');

    const isPopupLikeFlow =
      lowerPath.includes('/authorize') ||
      lowerPath.includes('/oauth2/') ||
      lowerSearch.includes('prompt=') ||
      lowerSearch.includes('scope=') ||
      lowerSearch.includes('response_type=');

    return isMicrosoftAuthHost && isPopupLikeFlow;
  } catch (error) {
    return false;
  }
}

function shouldAllowNativeOutlookPopup(rawUrl, openerUrl, features = '', disposition = '') {
  const lowerFeatures = String(features || '').toLowerCase();
  const lowerDisposition = String(disposition || '').toLowerCase();
  const lowerOpenerUrl = String(openerUrl || '').toLowerCase();
  const lowerUrl = String(rawUrl || '').toLowerCase();

  const openedFromOutlook =
    lowerOpenerUrl.includes('outlook.office.com') ||
    lowerOpenerUrl.includes('outlook.live.com') ||
    lowerOpenerUrl.includes('outlook.cloud.microsoft');

  if (!openedFromOutlook) return false;

  if (lowerUrl === 'about:blank') {
    return true;
  }

  const isOutlookTarget =
    lowerUrl.includes('outlook.office.com') ||
    lowerUrl.includes('outlook.live.com') ||
    lowerUrl.includes('outlook.cloud.microsoft');

  const looksLikePopup =
    lowerFeatures.includes('popup') ||
    lowerFeatures.includes('width=') ||
    lowerFeatures.includes('height=') ||
    lowerDisposition === 'new-window';

  const looksLikeMailWindow =
    lowerUrl.includes('/mail/') ||
    lowerUrl.includes('/mail?') ||
    lowerUrl.includes('/mail/inbox/');

  return isOutlookTarget && (looksLikePopup || looksLikeMailWindow);
}

function buildInternalPopupOptions(partition = APP_SESSION_PARTITION) {
  return {
    action: 'allow',
    overrideBrowserWindowOptions: {
      show: true,
      autoHideMenuBar: true,
      backgroundColor: '#FFFFFF',
      webPreferences: {
        partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        nativeWindowOpen: true
      }
    }
  };
}

function trackPopupWindow(window) {
  if (!window) return;

  popupWindows.add(window);
  window.setMenuBarVisibility(false);
  const popupWebContents = window.webContents;

  if (popupWebContents) {
    popupWebContents.on('did-start-navigation', (event, url, isInPlace, isMainFrame) => {
      if (!isMainFrame) return;
      logPrimaryFlow('popup-did-start-navigation', {
        id: popupWebContents.id,
        url,
        isInPlace
      });
    });

    popupWebContents.on('did-redirect-navigation', (event, url, isInPlace, isMainFrame) => {
      if (!isMainFrame) return;
      logPrimaryFlow('popup-did-redirect-navigation', {
        id: popupWebContents.id,
        url,
        isInPlace
      });
    });

    popupWebContents.on('did-finish-load', () => {
      if (popupWebContents.isDestroyed()) return;
      logPrimaryFlow('popup-did-finish-load', {
        id: popupWebContents.id,
        url: popupWebContents.getURL(),
        title: popupWebContents.getTitle()
      });
    });
  }

  window.once('closed', () => {
    popupWindows.delete(window);
  });
}

function getEffectiveUserAgent() {
  const configuredUserAgent = configManager.getUserAgent().trim();
  return configuredUserAgent || FIREFOX_USER_AGENT;
}

function sanitizeRestorableUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;

  try {
    const parsedUrl = new URL(rawUrl);
    const lowerHost = parsedUrl.hostname.toLowerCase();

    const transientParams = [
      'ct',
      'client-request-id',
      'wdPreviousSession',
      'wdPreviousSessionSrc',
      'wdorigin',
      'sessionid',
      'cidtoken'
    ];

    transientParams.forEach((param) => {
      parsedUrl.searchParams.delete(param);
    });

    if (
      lowerHost.includes('onedrive.live.com') ||
      lowerHost.includes('sharepoint.com') ||
      lowerHost.includes('officeapps.live.com') ||
      lowerHost.includes('word.cloud.microsoft') ||
      lowerHost.includes('excel.cloud.microsoft') ||
      lowerHost.includes('powerpoint.cloud.microsoft')
    ) {
      return parsedUrl.toString();
    }

    return rawUrl;
  } catch (error) {
    return rawUrl;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function persistRestorableTabs() {
  if (!configManager.getReopenTabsOnLaunch()) {
    configManager.saveTabs([]);
    configManager.setActiveTabId(null);
    return;
  }

  const restorableTabs = tabManager.tabs
    .filter((tab) => !tab.isPrimary)
    .map((tab) => ({
      url: sanitizeRestorableUrl(
        tab.restorableUrl ||
        ((tab.view && !tab.view.webContents.isDestroyed() && tab.view.webContents.getURL()) || tab.url)
      ),
      partition: tab.partition || APP_SESSION_PARTITION,
      appId: tab.appId || null,
      title: tab.title || '',
      fullTitle: tab.fullTitle || tab.title || ''
    }))
    .filter((tab) => tab.url && tab.url !== 'about:blank');

  configManager.saveTabs(restorableTabs);
  configManager.setActiveTabId(null);
}

async function restoreSavedTabsAfterPrimaryLoad(primaryTab, savedTabs) {
  if (!savedTabs.length) {
    persistRestorableTabs();
    return;
  }

  const primaryWebContents = primaryTab?.view?.webContents;
  if (!primaryWebContents || primaryWebContents.isDestroyed()) return;

  const runRestoreQueue = async () => {
    let isFirstTab = true;

    for (const savedTab of savedTabs) {
      if (!savedTab || !savedTab.url) continue;

      if (!isFirstTab) {
        await delay(1300);
      }

      createTab({
        url: savedTab.url,
        partition: savedTab.partition || APP_SESSION_PARTITION,
        appId: savedTab.appId || null,
        restoredAtStartup: true
      }, false);

      isFirstTab = false;
    }
  };

  if (!primaryWebContents.isLoadingMainFrame()) {
    await runRestoreQueue();
    return;
  }

  primaryWebContents.once('did-finish-load', () => {
    runRestoreQueue().catch((error) => {
      console.error('No se pudieron restaurar algunas pestañas al iniciar:', error);
    });
  });
}

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
    persistRestorableTabs();
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
      partition: APP_SESSION_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
      sandbox: true,
      spellcheck: true,
      nativeWindowOpen: true, // <-- Agrega esto
    },
    titleBarStyle: 'hidden', // Opcional, para macOS
    frame: false,            // <--- Esto es lo importante
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#FFFFFF',
  });
  mainWindow.setMaxListeners(0);

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
    mainWindow.maximize();
    mainWindow.show();

    tabManager.tabs = [];
    tabManager.activeTabId = null;
    tabManager.nextTabId = 1;
    const mainUrl = configManager.getMainUrl();
    const reopenTabsOnLaunch = configManager.getReopenTabsOnLaunch();
    const savedTabs = reopenTabsOnLaunch ? configManager.getTabs() : [];

    setTimeout(() => {
      const primaryTab = createTab({ url: mainUrl, isPrimary: true }, true);
      restoreSavedTabsAfterPrimaryLoad(primaryTab, savedTabs);
    }, 100);
  });

  mainWindow.on('resize', () => {
    updateActiveTabBounds();
  });

  // Asegurar que el BrowserView se redimensione también al maximizar/minimizar
  mainWindow.on('maximize', () => {
    // Pequeño delay para asegurar que la maximización termine
    setTimeout(() => updateActiveTabBounds(), 50);
  });

  mainWindow.on('unmaximize', () => {
    // Pequeño delay para asegurar que la restauración termine
    setTimeout(() => updateActiveTabBounds(), 50);
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
    if (!url || url === 'about:blank') {
      return { action: 'deny' };
    }

    if (isOfficeAppLaunchUrl(url)) {
      createTab(normalizeInternalAppUrl(url), true);
      return { action: 'deny' };
    }

    if (shouldAllowNativePopup(url)) {
      return buildInternalPopupOptions(APP_SESSION_PARTITION);
    }

    if (shouldOpenInternally(url)) {
      createTab(url, true);
      return { action: 'deny' };
    }

    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('did-create-window', (window) => {
    trackPopupWindow(window);
  });
}

// Función auxiliar para crear un BrowserView
function createBrowserView(options = {}) {
  const userAgent = getEffectiveUserAgent();
  const appId = options.appId || null;
  const partition = options.partition || APP_SESSION_PARTITION;
  const isPrimary = Boolean(options.isPrimary);
  
  const view = new BrowserView({
    webPreferences: {
      partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: true,
      webSecurity: true,
      nativeWindowOpen: true, // <-- Agrega esto
    },
  });
  
  // Establecer un user agent personalizado si está configurado
  view.webContents.setUserAgent(userAgent);

  view.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    const key = String(input.key || '').toLowerCase();

    if (input.shift && key === 'insert') {
      event.preventDefault();
      view.webContents.paste();
      return;
    }

    if (input.shift && key === 'delete') {
      event.preventDefault();
      view.webContents.cut();
    }
  });
  
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

  view.webContents.setWindowOpenHandler(({ url, features, disposition }) => {
    const openerUrl = view.webContents.getURL();

    if (isPrimary) {
      logPrimaryFlow('window-open', {
        url,
        openerUrl,
        disposition,
        features,
        isOfficeAppLaunch: isOfficeAppLaunchUrl(url),
        isOfficeDocument: isOfficeDocumentUrl(url),
        allowNativePopup: shouldAllowNativePopup(url),
        allowOutlookPopup: shouldAllowNativeOutlookPopup(url, openerUrl, features, disposition),
        shouldOpenInternal: shouldOpenInternally(url)
      });
    }

    if (shouldAllowNativeOutlookPopup(url, openerUrl, features, disposition)) {
      if (isPrimary) {
        logPrimaryFlow('window-open-result', {
          url,
          action: 'allow-native-outlook-popup'
        });
      }
      return buildInternalPopupOptions(partition);
    }

    if (!url || url === 'about:blank') {
      if (isPrimary) {
        logPrimaryFlow('window-open-result', {
          url,
          action: 'deny-about-blank'
        });
      }
      return { action: 'deny' };
    }

    if (isOfficeAppLaunchUrl(url)) {
      if (isPrimary) {
        logPrimaryFlow('window-open-result', {
          url,
          action: 'create-tab-office-app',
          normalizedUrl: normalizeInternalAppUrl(url)
        });
      }
      createTab({ url: normalizeInternalAppUrl(url), partition, appId }, true);
      return { action: 'deny' };
    }

    if (shouldAllowNativePopup(url)) {
      if (isPrimary) {
        logPrimaryFlow('window-open-result', {
          url,
          action: 'allow-native-popup'
        });
      }
      return buildInternalPopupOptions(partition);
    }

    if (shouldOpenInternally(url)) {
      if (isPrimary) {
        logPrimaryFlow('window-open-result', {
          url,
          action: 'create-tab-internal'
        });
      }
      createTab({ url, partition, appId }, true);
      return { action: 'deny' };
    }

    if (isPrimary) {
      logPrimaryFlow('window-open-result', {
        url,
        action: 'open-external'
      });
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  view.webContents.on('did-create-window', (window) => {
    if (isPrimary) {
      logPrimaryFlow('did-create-window', {
        id: window && window.webContents ? window.webContents.id : null
      });
    }
    trackPopupWindow(window);
  });
  
  view.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame && validatedURL === 'about:blank') {
      event.preventDefault();
    }
  });
  
  return view;
}

// Actualiza el área de la pestaña activa según el tamaño de la ventana
function updateActiveTabBounds() {
  if (mainWindow && tabManager.activeTabId) {
    let activeTab = tabManager.tabs.find(tab => tab.id === tabManager.activeTabId);
    if (activeTab) {
      let bounds = mainWindow.getContentBounds();
      const tabBarHeight = 32; // Altura de la barra de pestañas (32px)
      activeTab.view.setBounds({
        x: 0,
        y: tabBarHeight,
        width: bounds.width,
        height: bounds.height - tabBarHeight,
      });
    }
  }
}

function setSettingsOverlayVisible(visible) {
  if (!mainWindow || !tabManager.activeTabId) return;
  const activeTab = tabManager.tabs.find(tab => tab.id === tabManager.activeTabId);
  if (!activeTab) return;

  const currentViews = mainWindow.getBrowserViews();
  const hasView = currentViews.includes(activeTab.view);

  if (visible && hasView) {
    mainWindow.removeBrowserView(activeTab.view);
  } else if (!visible && !hasView) {
    mainWindow.addBrowserView(activeTab.view);
    updateActiveTabBounds();
  }
}

// Crea una nueva pestaña (BrowserView) con la URL indicada
function createTab(urlOrConfig, makeActive = false) {
  if (!mainWindow) return null;

  const tabConfig = typeof urlOrConfig === 'string'
    ? { url: urlOrConfig }
    : (urlOrConfig || {});
  const url = normalizeInternalAppUrl(tabConfig.url);
  const appId = tabConfig.appId || null;
  const partition = tabConfig.partition || APP_SESSION_PARTITION;
  const isPrimary = Boolean(tabConfig.isPrimary);
  const restoredAtStartup = Boolean(tabConfig.restoredAtStartup);

  // Evitar crear pestañas para about:blank
  if (url === 'about:blank') {
    return null;
  }

  // console.log(`Creando nueva pestaña con URL: ${url}, makeActive: ${makeActive}`);
  
  const view = createBrowserView({ partition, appId, isPrimary });

  let bounds = mainWindow.getContentBounds();
  const tabBarHeight = 32; // Altura de la barra de pesta\u00f1as (32px)
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
    restorableUrl: sanitizeRestorableUrl(url),
    title: url,
    fullTitle: url,
    partition,
    appId,
    isPrimary
  };
  
  // Añadir a la lista de pestañas
  if (isPrimary) {
    tabManager.tabs.unshift(tab);
  } else {
    tabManager.tabs.push(tab);
  }
  
  // Si es la pestaña activa, ponerla en primer plano inmediatamente
  if (makeActive) {
    // console.log(`Activando pestaña ${tabId} inmediatamente`);
    switchTab(tabId);
  }
  
  // Cargar la URL
  view.webContents.loadURL(url);

  const updateTabUrl = (nextUrl) => {
    if (!nextUrl || nextUrl === 'about:blank') return;
    const sanitizedUrl = sanitizeRestorableUrl(nextUrl);
    tab.url = sanitizedUrl;

    if (isOfficeDocumentUrl(nextUrl)) {
      tab.restorableUrl = sanitizedUrl;
      return;
    }

    if (!tab.restorableUrl || !isOfficeDocumentUrl(tab.restorableUrl)) {
      tab.restorableUrl = sanitizedUrl;
    }
  };
  
  // Intercepta eventos de navegación
  view.webContents.on('will-navigate', (event, navigationUrl) => {
    if (isPrimary) {
      logPrimaryFlow('will-navigate', {
        currentUrl: view.webContents.getURL(),
        navigationUrl,
        isOfficeAppLaunch: isOfficeAppLaunchUrl(navigationUrl),
        isOfficeDocument: isOfficeDocumentUrl(navigationUrl),
        shouldOpenInternal: shouldOpenInternally(navigationUrl),
        allowNativePopup: shouldAllowNativePopup(navigationUrl)
      });
    }

    if (navigationUrl === 'about:blank') {
      event.preventDefault();
      return;
    }

    const normalizedNavigationUrl = normalizeInternalAppUrl(navigationUrl);

    if (isOfficeAppLaunchUrl(navigationUrl) && normalizedNavigationUrl !== navigationUrl) {
      if (isPrimary) {
        logPrimaryFlow('will-navigate-result', {
          navigationUrl,
          action: 'create-tab-office-app',
          normalizedUrl: normalizedNavigationUrl
        });
      }
      event.preventDefault();
      createTab({ url: normalizedNavigationUrl, partition, appId }, true);
      return;
    }

    const currentURL = view.webContents.getURL();
    try {
      if (shouldOpenInternally(currentURL) && !shouldOpenInternally(navigationUrl)) {
        if (isPrimary) {
          logPrimaryFlow('will-navigate-result', {
            navigationUrl,
            action: 'open-external'
          });
        }
        event.preventDefault();
        shell.openExternal(navigationUrl);
        showWebNotification('Abriendo enlace externo en el navegador');
      }
    } catch (error) {
      // console.error('Error en navegación:', error);
    }
  });

  // Interceptar navegación a about:blank también en did-start-navigation
  view.webContents.on('did-start-navigation', (event, navigationUrl, isInPlace, isMainFrame) => {
    if (isMainFrame && navigationUrl === 'about:blank') {
      event.preventDefault();
      return;
    }
  });

  view.webContents.on('did-navigate', (event, navigationUrl) => {
    updateTabUrl(navigationUrl);
    sendTabsUpdate();
  });

  view.webContents.on('did-redirect-navigation', (event, navigationUrl, isInPlace, isMainFrame) => {
    if (!isMainFrame) return;
    updateTabUrl(navigationUrl);
    sendTabsUpdate();
  });
  
  // Interceptamos la actualización del título para mostrar solo la parte anterior al guion (-)
  view.webContents.on('page-title-updated', (event, title) => {
    tab.fullTitle = title;
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

  view.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || !restoredAtStartup) return;
    if (errorCode === -3) return;

    const restoredTab = tabManager.tabs.find((existingTab) => existingTab.id === tabId);
    if (!restoredTab || restoredTab.isPrimary) return;

    closeTab(tabId);
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

    if (tab.isPrimary) {
      return;
    }

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
      createTab({ url: mainUrl, isPrimary: true }, true);
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

function moveTab(tabId, targetIndex) {
  const sourceIndex = tabManager.tabs.findIndex((tab) => tab.id === tabId);
  if (sourceIndex === -1) return false;

  const sourceTab = tabManager.tabs[sourceIndex];
  if (!sourceTab || sourceTab.isPrimary) return false;

  const minIndex = tabManager.tabs[0] && tabManager.tabs[0].isPrimary ? 1 : 0;
  const maxIndex = tabManager.tabs.length - 1;
  let nextIndex = Math.max(minIndex, Math.min(Number(targetIndex), maxIndex));

  if (Number.isNaN(nextIndex) || nextIndex === sourceIndex) {
    return false;
  }

  if (sourceIndex < nextIndex) {
    nextIndex -= 1;
  }

  if (nextIndex === sourceIndex) {
    return false;
  }

  tabManager.tabs.splice(sourceIndex, 1);
  tabManager.tabs.splice(nextIndex, 0, sourceTab);
  sendTabsUpdate();
  return true;
}

function reorderTabs(orderedIds) {
  if (!Array.isArray(orderedIds) || orderedIds.length !== tabManager.tabs.length) {
    return false;
  }

  const tabById = new Map(tabManager.tabs.map((tab) => [tab.id, tab]));
  const reorderedTabs = orderedIds
    .map((id) => tabById.get(Number(id)))
    .filter(Boolean);

  if (reorderedTabs.length !== tabManager.tabs.length) {
    return false;
  }

  const primaryIndex = reorderedTabs.findIndex((tab) => tab.isPrimary);
  if (primaryIndex > 0) {
    const [primaryTab] = reorderedTabs.splice(primaryIndex, 1);
    reorderedTabs.unshift(primaryTab);
  }

  tabManager.tabs = reorderedTabs;
  sendTabsUpdate();
  return true;
}

function detachTabToWindow(tabId) {
  const index = tabManager.tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return false;

  const tab = tabManager.tabs[index];
  if (!tab || tab.isPrimary) return false;

  const targetUrl = tab.view?.webContents?.isDestroyed()
    ? tab.url
    : (tab.view.webContents.getURL() || tab.url);

  const popupWindow = openManagedPopupWindow(targetUrl, tab.partition || APP_SESSION_PARTITION);
  if (!popupWindow) return false;

  closeTab(tabId);
  return true;
}

// Envía al renderer la información actualizada de las pestañas para actualizar la UI
function sendTabsUpdate() {
  if (mainWindow) {
    let tabsForUI = tabManager.tabs.map(tab => ({
      id: tab.id,
      title: tab.title,
      fullTitle: tab.fullTitle || tab.title,
      url: tab.url,
      isPrimary: Boolean(tab.isPrimary)
    }));
    mainWindow.webContents.send('tabs-updated', { tabs: tabsForUI, activeTabId: tabManager.activeTabId });
  }

  persistRestorableTabs();
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

ipcMain.on('move-tab', (event, tabId, targetIndex) => {
  moveTab(tabId, targetIndex);
});

ipcMain.on('reorder-tabs', (event, orderedIds) => {
  reorderTabs(orderedIds);
});

ipcMain.on('detach-tab-to-window', (event, tabId) => {
  detachTabToWindow(tabId);
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

ipcMain.handle('toggle-maximize', () => {
  if (!mainWindow) return false;

  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  }

  mainWindow.maximize();
  return true;
});

ipcMain.handle('capture-active-tab-preview', async () => {
  if (!mainWindow || !tabManager.activeTabId) return null;

  const activeTab = tabManager.tabs.find(tab => tab.id === tabManager.activeTabId);
  if (!activeTab || !activeTab.view) return null;

  try {
    const image = await activeTab.view.webContents.capturePage();
    return image.toDataURL();
  } catch (error) {
    console.error('No se pudo capturar la vista activa:', error);
    return null;
  }
});

ipcMain.on('toggle-settings-overlay', (event, visible) => {
  setSettingsOverlayVisible(Boolean(visible));
});

ipcMain.on('open-url-in-active-tab', (event, url) => {
  if (!mainWindow || !url) return;
  const activeTab = tabManager.tabs.find(tab => tab.id === tabManager.activeTabId);
  if (activeTab && activeTab.view) {
    activeTab.url = url;
    activeTab.view.webContents.loadURL(url);
    sendTabsUpdate();
  } else {
    createTab(url, true);
  }
});

// Gestión de configuración
ipcMain.handle('get-main-url', () => {
  return configManager.getMainUrl();
});

ipcMain.handle('set-main-url', (event, url) => {
  configManager.setMainUrl(url);

  const activeTab = tabManager.tabs.find(tab => tab.id === tabManager.activeTabId);
  if (activeTab && activeTab.view) {
    activeTab.url = url;
    activeTab.view.webContents.loadURL(url);
    sendTabsUpdate();
  }

  return true;
});

ipcMain.handle('get-user-agent', () => {
  return configManager.getUserAgent();
});

ipcMain.handle('set-user-agent', (event, userAgent) => {
  configManager.setUserAgent(userAgent);

  const activeTab = tabManager.tabs.find(tab => tab.id === tabManager.activeTabId);
  if (activeTab && activeTab.view) {
    activeTab.view.webContents.setUserAgent(getEffectiveUserAgent());
  }

  return true;
});

ipcMain.handle('get-theme', () => {
  return configManager.getTheme();
});

ipcMain.handle('set-theme', (event, theme) => {
  configManager.setTheme(theme);
  return true;
});

ipcMain.handle('get-reopen-tabs-on-launch', () => {
  return configManager.getReopenTabsOnLaunch();
});

ipcMain.handle('set-reopen-tabs-on-launch', (event, enabled) => {
  configManager.setReopenTabsOnLaunch(enabled);
  persistRestorableTabs();
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
    {
      label: 'Aplicaciones',
      submenu: [
        {
          label: 'Word',
          click: () => openTrayAppWindow('word')
        },
        {
          label: 'Excel',
          click: () => openTrayAppWindow('excel')
        },
        {
          label: 'PowerPoint',
          click: () => openTrayAppWindow('powerpoint')
        },
        {
          label: 'Outlook',
          click: () => openTrayAppWindow('outlook')
        },
        {
          label: 'OneDrive',
          click: () => openTrayAppWindow('onedrive')
        },
        {
          label: 'Teams',
          click: () => openTrayAppWindow('teams')
        },
        {
          label: 'OneNote',
          click: () => openTrayAppWindow('onenote')
        }
      ]
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

// --- PREVENIR MÚLTIPLES INSTANCIAS ---
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Otra instancia está corriendo, salir inmediatamente
  app.quit();
} else {
  // Si se intenta abrir una segunda instancia, enfocar la ventana existente
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // Asegurar que el tray esté activo (solo uno)
    if (!tray) {
      createTray();
    }
  });

  // Iniciar la aplicación una vez que esté lista
  app.whenReady().then(() => {
    const appSession = session.fromPartition(APP_SESSION_PARTITION);

    // Configurar permisos para medios (cámara, micrófono)
    appSession.setPermissionRequestHandler((webContents, permission, callback) => {
      const allowedPermissions = [
        'media',
        'notifications',
        'clipboard-read',
        'clipboard-sanitized-write',
        'clipboard-write',
        'fullscreen'
      ];
      callback(allowedPermissions.includes(permission));
    });

    appSession.setPermissionCheckHandler((webContents, permission) => {
      const allowedPermissions = [
        'media',
        'notifications',
        'clipboard-read',
        'clipboard-sanitized-write',
        'clipboard-write',
        'fullscreen'
      ];
      return allowedPermissions.includes(permission);
    });

    appSession.setDisplayMediaRequestHandler(
      async (request, callback) => {
        try {
          const sources = await desktopCapturer.getSources({
            types: ['screen', 'window'],
            thumbnailSize: { width: 320, height: 180 },
            fetchWindowIcons: true
          });

          if (!sources.length) {
            callback({ video: null, audio: null });
            return;
          }

          const preferredSource =
            sources.find((source) => source.display_id && source.id.startsWith('screen:')) ||
            sources.find((source) => source.id.startsWith('screen:')) ||
            sources[0];

          callback({
            video: preferredSource,
            audio: 'loopback'
          });
        } catch (error) {
          console.error('Error al solicitar captura de pantalla:', error);
          callback({ video: null, audio: null });
        }
      },
      {
        useSystemPicker: true
      }
    );
    
    // Interceptar clicks en links para decidir dónde abrirlos
    appSession.webRequest.onBeforeRequest({
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
    if (!tray) createTray(); // Solo crear tray si no existe
    
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
}
