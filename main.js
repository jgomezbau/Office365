const { app, BrowserWindow, WebContentsView, ipcMain, session, Menu, shell, clipboard, Tray, desktopCapturer, screen, nativeImage } = require('electron');
const path = require('path');
const configManager = require('./src/config/configManager');
const { shouldOpenInternally } = require('./src/utils/urlHandler');
const { getAvailableAppsForFile, downloadAndOpenWithApp, detectFileType } = require('./src/utils/nativeAppHandler');

// Verificar si estamos en desarrollo
const isDev = process.env.IS_DEV === 'true';
const debugPrimaryFlow = process.env.DEBUG_PRIMARY_FLOW === 'true';
const APP_SESSION_PARTITION = 'persist:o365linuxdesktop';
const FIREFOX_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0';
let mainWindow;
let tray = null; // Variable para mantener la referencia al Tray
const popupWindows = new Set();
let tabDragGhostWindow = null;
let tabDragGhostFollowInterval = null;
let floatingModalWindow = null;
let floatingModalState = null;
let floatingModalLoaded = false;
let activeMainContentView = null;
let saveWindowStateTimeout = null;

const TAB_DRAG_GHOST_WIDTH = 320;
const TAB_DRAG_GHOST_HEIGHT = 188;
const TAB_DRAG_GHOST_OFFSET_X = 18;
const TAB_DRAG_GHOST_OFFSET_Y = 16;
const TAB_INFO_MODAL_WIDTH = 340;
const TAB_INFO_MODAL_HEIGHT = 248;
const TAB_INFO_MODAL_MARGIN = 12;

function logPrimaryFlow(label, payload) {
  if (!debugPrimaryFlow) return;
  console.log(`[PRIMARY][${label}]`, payload);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getTabDragGhostHtml(title = '') {
  const safeTitle = escapeHtml(title || 'Ventana separada');
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; font-family: 'Segoe UI', sans-serif; }
    body { display: flex; align-items: stretch; justify-content: stretch; padding: 0; }
    .ghost-window { width: 100%; height: 100%; border-radius: 14px; border: 1px solid rgba(255,255,255,0.18); background: rgba(28,32,38,0.34); box-shadow: 0 18px 44px rgba(0,0,0,0.28); backdrop-filter: blur(2px); overflow: hidden; }
    .ghost-titlebar { display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 14px; background: rgba(255,255,255,0.07); border-bottom: 1px solid rgba(255,255,255,0.08); }
    .ghost-dot { width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,0.28); flex: 0 0 auto; }
    .ghost-title { min-width: 0; color: rgba(255,255,255,0.88); font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ghost-body { display: flex; flex-direction: column; gap: 12px; padding: 18px 16px; }
    .ghost-line { height: 12px; border-radius: 999px; background: rgba(255,255,255,0.16); }
    .ghost-line.short { width: 42%; }
    .ghost-line.medium { width: 64%; }
    .ghost-line.long { width: 88%; }
    .ghost-panel { margin-top: 4px; height: 78px; border-radius: 10px; border: 1px dashed rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); }
  </style>
</head>
<body>
  <div class="ghost-window">
    <div class="ghost-titlebar">
      <div class="ghost-dot"></div>
      <div class="ghost-title">${safeTitle}</div>
    </div>
    <div class="ghost-body">
      <div class="ghost-line short"></div>
      <div class="ghost-line long"></div>
      <div class="ghost-line medium"></div>
      <div class="ghost-panel"></div>
    </div>
  </div>
</body>
</html>`;
}

function updateTabDragGhostPosition(screenX = 0, screenY = 0) {
  if (!tabDragGhostWindow || tabDragGhostWindow.isDestroyed()) return;
  tabDragGhostWindow.setBounds({
    x: Math.round(screenX + TAB_DRAG_GHOST_OFFSET_X),
    y: Math.round(screenY + TAB_DRAG_GHOST_OFFSET_Y),
    width: TAB_DRAG_GHOST_WIDTH,
    height: TAB_DRAG_GHOST_HEIGHT
  }, false);
}

function ensureTabDragGhostWindow(title = '') {
  if (!tabDragGhostWindow || tabDragGhostWindow.isDestroyed()) {
    tabDragGhostWindow = new BrowserWindow({
      width: TAB_DRAG_GHOST_WIDTH,
      height: TAB_DRAG_GHOST_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: true,
      fullscreenable: false,
      parent: mainWindow || undefined,
      webPreferences: {
        sandbox: true,
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    tabDragGhostWindow.setMenuBarVisibility(false);
    tabDragGhostWindow.setIgnoreMouseEvents(true, { forward: true });
    tabDragGhostWindow.on('closed', () => {
      tabDragGhostWindow = null;
    });
  }

  if (tabDragGhostWindow.__ghostTitle !== title) {
    tabDragGhostWindow.__ghostTitle = title;
    tabDragGhostWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getTabDragGhostHtml(title))}`);
  }

  return tabDragGhostWindow;
}

function showTabDragGhost(payload = {}) {
  const title = typeof payload.title === 'string' ? payload.title : '';
  const fallbackPoint = screen.getCursorScreenPoint();
  const screenX = Number(payload.screenX) || fallbackPoint.x;
  const screenY = Number(payload.screenY) || fallbackPoint.y;
  const ghostWindow = ensureTabDragGhostWindow(title);
  if (!ghostWindow) return;

  ghostWindow.showInactive();
  updateTabDragGhostPosition(screenX, screenY);
  startTabDragGhostFollow();
}

function moveTabDragGhost(payload = {}) {
  const fallbackPoint = screen.getCursorScreenPoint();
  updateTabDragGhostPosition(
    Number(payload.screenX) || fallbackPoint.x,
    Number(payload.screenY) || fallbackPoint.y
  );
}

function stopTabDragGhostFollow() {
  if (!tabDragGhostFollowInterval) return;
  clearInterval(tabDragGhostFollowInterval);
  tabDragGhostFollowInterval = null;
}

function startTabDragGhostFollow() {
  stopTabDragGhostFollow();
  tabDragGhostFollowInterval = setInterval(() => {
    if (!tabDragGhostWindow || tabDragGhostWindow.isDestroyed() || !tabDragGhostWindow.isVisible()) {
      stopTabDragGhostFollow();
      return;
    }

    const point = screen.getCursorScreenPoint();
    updateTabDragGhostPosition(point.x, point.y);
  }, 16);
}

function hideTabDragGhost() {
  stopTabDragGhostFollow();
  if (!tabDragGhostWindow || tabDragGhostWindow.isDestroyed()) return;
  tabDragGhostWindow.hide();
}


function areBoundsVisible(bounds) {
  if (!bounds) return false;

  const displays = screen.getAllDisplays();
  return displays.some(({ workArea }) => {
    const overlapWidth = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x);
    const overlapHeight = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y);
    return overlapWidth >= 120 && overlapHeight >= 120;
  });
}

function getValidatedWindowBounds() {
  const savedBounds = configManager.getWindowBounds();
  if (
    savedBounds &&
    Number.isFinite(savedBounds.x) &&
    Number.isFinite(savedBounds.y) &&
    Number.isFinite(savedBounds.width) &&
    Number.isFinite(savedBounds.height) &&
    savedBounds.width >= 900 &&
    savedBounds.height >= 650 &&
    areBoundsVisible(savedBounds)
  ) {
    return savedBounds;
  }

  const primaryWorkArea = screen.getPrimaryDisplay().workArea;
  const width = Math.min(1200, primaryWorkArea.width);
  const height = Math.min(800, primaryWorkArea.height);
  const x = primaryWorkArea.x + Math.max(0, Math.round((primaryWorkArea.width - width) / 2));
  const y = primaryWorkArea.y + Math.max(0, Math.round((primaryWorkArea.height - height) / 2));

  return { x, y, width, height };
}

function persistMainWindowState(immediate = false) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const saveState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    configManager.setWindowMaximized(mainWindow.isMaximized());

    const bounds = mainWindow.isMaximized()
      ? mainWindow.getNormalBounds()
      : mainWindow.getBounds();

    configManager.setWindowBounds(bounds);
    saveWindowStateTimeout = null;
  };

  if (saveWindowStateTimeout) {
    clearTimeout(saveWindowStateTimeout);
    saveWindowStateTimeout = null;
  }

  if (immediate) {
    saveState();
    return;
  }

  saveWindowStateTimeout = setTimeout(saveState, 180);
}

function getFloatingModalWindowBounds(type = floatingModalState?.type, payload = floatingModalState?.payload || {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;

  const mainBounds = mainWindow.getBounds();

  if (type === 'tab-info') {
    const anchorRect = payload.anchorRect || {};
    const width = TAB_INFO_MODAL_WIDTH;
    const height = TAB_INFO_MODAL_HEIGHT;
    const left = Number(anchorRect.left) || TAB_INFO_MODAL_MARGIN;
    const bottom = Number(anchorRect.bottom) || 0;
    const anchorWidth = Number(anchorRect.width) || 0;

    const maxLeft = Math.max(TAB_INFO_MODAL_MARGIN, mainBounds.width - width - TAB_INFO_MODAL_MARGIN);
    const x = mainBounds.x + Math.round(Math.min(Math.max(left + (anchorWidth / 2) - (width / 2), TAB_INFO_MODAL_MARGIN), maxLeft));
    const maxTop = Math.max(TAB_INFO_MODAL_MARGIN, mainBounds.height - height - TAB_INFO_MODAL_MARGIN);
    const y = mainBounds.y + Math.round(Math.min(Math.max(bottom + 10, TAB_INFO_MODAL_MARGIN), maxTop));

    return { x, y, width, height };
  }

  return mainBounds;
}

function syncFloatingModalWindowBounds() {
  if (!floatingModalWindow || floatingModalWindow.isDestroyed()) return;
  const bounds = getFloatingModalWindowBounds();
  if (!bounds) return;
  floatingModalWindow.setBounds(bounds, false);
}

function buildFloatingModalState(type, payload = {}) {
  return {
    type,
    payload,
    windowBounds: getFloatingModalWindowBounds(type, payload)
  };
}

function sendFloatingModalState() {
  if (!floatingModalWindow || floatingModalWindow.isDestroyed() || !floatingModalLoaded || !floatingModalState) return;
  floatingModalWindow.webContents.send('floating-modal-state', floatingModalState);
}

function ensureFloatingModalWindow() {
  if (floatingModalWindow && !floatingModalWindow.isDestroyed()) {
    syncFloatingModalWindowBounds();
    return floatingModalWindow;
  }

  const bounds = getFloatingModalWindowBounds();
  if (!bounds) return null;

  floatingModalLoaded = false;
  floatingModalWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    parent: mainWindow,
    modal: false,
    focusable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'modal-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  floatingModalWindow.setMenuBarVisibility(false);
  floatingModalWindow.loadFile(path.join(__dirname, 'src', 'modal.html'));

  floatingModalWindow.once('ready-to-show', () => {
    syncFloatingModalWindowBounds();
    sendFloatingModalState();
    floatingModalWindow.show();
    floatingModalWindow.focus();
  });

  floatingModalWindow.webContents.on('did-finish-load', () => {
    floatingModalLoaded = true;
    sendFloatingModalState();
  });

  floatingModalWindow.on('closed', () => {
    floatingModalWindow = null;
    floatingModalLoaded = false;
    floatingModalState = null;
  });

  return floatingModalWindow;
}

function openFloatingModal(type, payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  floatingModalState = buildFloatingModalState(type, payload);
  const modalWindow = ensureFloatingModalWindow();
  if (!modalWindow) return;

  syncFloatingModalWindowBounds();

  if (floatingModalLoaded) {
    sendFloatingModalState();
    modalWindow.show();
    modalWindow.focus();
  }
}

function closeFloatingModal() {
  floatingModalState = null;
  if (!floatingModalWindow || floatingModalWindow.isDestroyed()) return;
  floatingModalWindow.hide();
}

function toggleFloatingModal(config = {}) {
  const type = config && typeof config.type === 'string' ? config.type : null;
  const payload = config && typeof config.payload === 'object' ? config.payload : {};
  if (!type) return;

  const isSameTypeVisible =
    floatingModalWindow &&
    !floatingModalWindow.isDestroyed() &&
    floatingModalWindow.isVisible() &&
    floatingModalState &&
    floatingModalState.type === type;

  if (isSameTypeVisible) {
    closeFloatingModal();
    return;
  }

  openFloatingModal(type, payload);
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

const FAVORITE_TYPE_ORDER = ['word', 'excel', 'powerpoint', 'pdf', 'outlook', 'onedrive', 'teams', 'sharepoint', 'onenote', 'other'];

function inferFavoriteType(favorite = {}) {
  const url = String(favorite.url || '').toLowerCase();
  const title = String(favorite.title || '').toLowerCase();
  const appId = String(favorite.appId || '').toLowerCase();

  const hasAny = (values) => values.some((value) => url.includes(value) || title.includes(value) || appId.includes(value));

  if (hasAny(['.doc', '.docx', 'word', 'app=word', 'ithint=file%2cdoc', 'ithint=file,doc'])) return 'word';
  if (hasAny(['.xls', '.xlsx', '.xlsm', '.csv', 'excel', 'app=excel', 'ithint=file%2cxls', 'ithint=file,xls'])) return 'excel';
  if (hasAny(['.ppt', '.pptx', 'powerpoint', 'app=powerpoint', 'ithint=file%2cppt', 'ithint=file,ppt'])) return 'powerpoint';
  if (hasAny(['.pdf', 'pdf'])) return 'pdf';
  if (hasAny(['outlook', '/mail', 'owa'])) return 'outlook';
  if (hasAny(['onedrive', 'onedrive.live.com'])) return 'onedrive';
  if (hasAny(['teams'])) return 'teams';
  if (hasAny(['sharepoint', '/sites/'])) return 'sharepoint';
  if (hasAny(['onenote'])) return 'onenote';
  return 'other';
}

function getFavoriteTypeIconPath(type = 'other') {
  const iconsDir = path.join(__dirname, 'icons');
  const iconNameByType = {
    word: 'word.png',
    excel: 'excel.png',
    powerpoint: 'powerpoint.png',
    pdf: 'icon.png',
    outlook: 'outlook.png',
    onedrive: 'onedrive.png',
    teams: 'teams.png',
    sharepoint: 'sharepoint.png',
    onenote: 'onenote.png',
    other: 'icon.png'
  };

  return path.join(iconsDir, iconNameByType[type] || iconNameByType.other);
}

function getFavoriteMenuIcon(type = 'other') {
  const image = nativeImage.createFromPath(getFavoriteTypeIconPath(type));
  return image.isEmpty() ? undefined : image.resize({ width: 16, height: 16 });
}

function normalizeFavoriteEntry(favorite = {}) {
  const url = sanitizeRestorableUrl(favorite.url || '');
  if (!url || url === 'about:blank') return null;

  const title = sanitizeFavoriteTitle(favorite.title || '', url);
  const type = favorite.type || inferFavoriteType({ ...favorite, url, title });

  return {
    key: favorite.key || getFavoriteKeyFromUrl(url),
    url,
    title,
    partition: favorite.partition || APP_SESSION_PARTITION,
    appId: favorite.appId || null,
    type
  };
}

function getFavoriteServiceLabel(rawUrl = '') {
  const value = String(rawUrl || '').toLowerCase();
  if (value.includes('onedrive')) return 'OneDrive';
  if (value.includes('sharepoint')) return 'SharePoint';
  if (value.includes('outlook')) return 'Outlook';
  if (value.includes('teams')) return 'Teams';
  if (value.includes('onenote')) return 'OneNote';
  if (value.includes('excel')) return 'Excel';
  if (value.includes('powerpoint')) return 'PowerPoint';
  if (value.includes('word')) return 'Word';
  return 'Favorito';
}

function sanitizeFavoriteTitle(rawTitle = '', rawUrl = '') {
  const cleanedTitle = String(rawTitle || '')
    .trim()
    .replace(/\s*[|·-]\s*(microsoft\s*365|onedrive|sharepoint|outlook|teams|word|excel|powerpoint|onenote|office)\s*$/i, '')
    .replace(/^continue$/i, '')
    .replace(/^working\.\.\.$/i, '')
    .trim();

  if (cleanedTitle && !/^https?:\/\//i.test(cleanedTitle) && !/^file:\/\//i.test(cleanedTitle)) {
    return cleanedTitle;
  }

  try {
    const parsedUrl = new URL(rawUrl);
    if (parsedUrl.protocol === 'file:') {
      const localPath = decodeURIComponent(parsedUrl.pathname || '');
      const localName = path.basename(localPath);
      if (localName) return localName;
    }

    const pathname = decodeURIComponent(parsedUrl.pathname || '');
    const lastSegment = pathname.split('/').filter(Boolean).pop() || '';
    if (lastSegment && !/^(doc|doc2|wopiframe|guestaccess)\.aspx$/i.test(lastSegment)) {
      return lastSegment;
    }
  } catch (error) {
    // Ignorar errores de normalización y usar fallback amigable.
  }

  return getFavoriteServiceLabel(rawUrl);
}

function getFavoriteUrlFromTab(tab) {
  if (!tab) return '';
  return sanitizeRestorableUrl(tab.restorableUrl || tab.url || '');
}

function getFavoriteKeyFromUrl(rawUrl = '') {
  return sanitizeRestorableUrl(rawUrl || '');
}

function getStoredFavorites() {
  const rawFavorites = configManager.getFavorites().filter((favorite) => favorite && favorite.url);
  const normalizedFavorites = rawFavorites
    .map((favorite) => normalizeFavoriteEntry(favorite))
    .filter(Boolean);

  const serializedRaw = JSON.stringify(rawFavorites);
  const serializedNormalized = JSON.stringify(normalizedFavorites);
  if (serializedRaw !== serializedNormalized) {
    configManager.setFavorites(normalizedFavorites);
  }

  return normalizedFavorites;
}

function setStoredFavorites(favorites) {
  const normalizedFavorites = (Array.isArray(favorites) ? favorites : [])
    .map((favorite) => normalizeFavoriteEntry(favorite))
    .filter(Boolean);

  configManager.setFavorites(normalizedFavorites);
  rebuildTrayMenu();
}

function getFavoriteEntryFromTab(tab) {
  const url = getFavoriteUrlFromTab(tab);
  if (!url || url === 'about:blank') return null;

  return normalizeFavoriteEntry({
    key: getFavoriteKeyFromUrl(url),
    url,
    title: sanitizeFavoriteTitle(tab.fullTitle || tab.title || '', url),
    partition: tab.partition || APP_SESSION_PARTITION,
    appId: tab.appId || null,
    type: inferFavoriteType({
      url,
      title: tab.fullTitle || tab.title || '',
      appId: tab.appId || null
    })
  });
}

function isFavoriteTab(tab) {
  const favoriteKey = getFavoriteKeyFromUrl(getFavoriteUrlFromTab(tab));
  if (!favoriteKey) return false;

  return getStoredFavorites().some((favorite) => (favorite.key || getFavoriteKeyFromUrl(favorite.url)) === favoriteKey);
}

function updateFavoriteEntryForTab(tab, candidateUrls = []) {
  const nextEntry = getFavoriteEntryFromTab(tab);
  if (!nextEntry) return false;

  const candidateKeys = new Set(
    [...candidateUrls, tab.url, tab.restorableUrl, nextEntry.url]
      .filter(Boolean)
      .map((value) => getFavoriteKeyFromUrl(value))
      .filter(Boolean)
  );

  if (!candidateKeys.size) return false;

  const favorites = getStoredFavorites();
  const index = favorites.findIndex((favorite) => candidateKeys.has(favorite.key || getFavoriteKeyFromUrl(favorite.url)));
  if (index === -1) return false;

  favorites[index] = { ...favorites[index], ...nextEntry };
  setStoredFavorites(favorites);
  return true;
}

function toggleFavoriteForTab(tabId) {
  const tab = tabManager.tabs.find((existingTab) => existingTab.id === Number(tabId));
  if (!tab || tab.isPrimary) {
    return { tabId: Number(tabId) || null, isFavorite: false };
  }

  const nextEntry = getFavoriteEntryFromTab(tab);
  if (!nextEntry) {
    return { tabId: tab.id, isFavorite: false };
  }

  const favorites = getStoredFavorites();
  const index = favorites.findIndex((favorite) => (favorite.key || getFavoriteKeyFromUrl(favorite.url)) === nextEntry.key);
  let isFavorite = false;

  if (index >= 0) {
    favorites.splice(index, 1);
  } else {
    favorites.push(nextEntry);
    isFavorite = true;
  }

  setStoredFavorites(favorites);
  return { tabId: tab.id, isFavorite };
}

function openFavoriteFromTray(favorite) {
  if (!favorite || !favorite.url) return null;
  return openManagedPopupWindow(favorite.url, favorite.partition || APP_SESSION_PARTITION);
}

function buildFavoritesTraySubmenu() {
  const favorites = getStoredFavorites();
  if (!favorites.length) {
    return [{ label: 'Sin favoritos', enabled: false }];
  }

  const groups = FAVORITE_TYPE_ORDER
    .map((type) => ({
      type,
      favorites: favorites
        .filter((favorite) => (favorite.type || 'other') === type)
        .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'es', { sensitivity: 'base' }))
    }))
    .filter((group) => group.favorites.length > 0);

  const submenu = [];

  groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      submenu.push({ type: 'separator' });
    }

    group.favorites.forEach((favorite) => {
      submenu.push({
        label: favorite.title || getFavoriteServiceLabel(favorite.url),
        icon: getFavoriteMenuIcon(favorite.type || 'other'),
        click: () => openFavoriteFromTray(favorite)
      });
    });
  });

  return submenu;
}

function buildTrayMenuTemplate() {
  return [
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
      label: 'Favoritos',
      submenu: buildFavoritesTraySubmenu()
    },
    {
      label: 'Aplicaciones',
      submenu: [
        { label: 'Word', click: () => openTrayAppWindow('word') },
        { label: 'Excel', click: () => openTrayAppWindow('excel') },
        { label: 'PowerPoint', click: () => openTrayAppWindow('powerpoint') },
        { label: 'Outlook', click: () => openTrayAppWindow('outlook') },
        { label: 'OneDrive', click: () => openTrayAppWindow('onedrive') },
        { label: 'Teams', click: () => openTrayAppWindow('teams') },
        { label: 'OneNote', click: () => openTrayAppWindow('onenote') }
      ]
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ];
}

function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate()));
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
  },
  // No guardar pestañas entre sesiones
  saveTabs: function() {
    persistRestorableTabs();
  }
};

// Crea la ventana principal y carga el HTML
function createMainWindow() {
  const initialBounds = getValidatedWindowBounds();
  const shouldStartMaximized = configManager.getWindowMaximized();

  mainWindow = new BrowserWindow({
    x: initialBounds.x,
    y: initialBounds.y,
    width: initialBounds.width,
    height: initialBounds.height,
    minWidth: 900,
    minHeight: 650,
    icon: path.join(__dirname, 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: APP_SESSION_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
      sandbox: true,
      spellcheck: true,
      nativeWindowOpen: true,
    },
    titleBarStyle: 'hidden',
    frame: false,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#FFFFFF',
  });
  mainWindow.setMaxListeners(0);

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  }

  // Mostrar la ventana cuando esté lista
  mainWindow.once('ready-to-show', () => {
    if (shouldStartMaximized) {
      mainWindow.maximize();
    }
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
    syncFloatingModalWindowBounds();
    persistMainWindowState();
  });

  mainWindow.on('move', () => {
    syncFloatingModalWindowBounds();
    persistMainWindowState();
  });

  mainWindow.on('maximize', () => {
    persistMainWindowState(true);
    setTimeout(() => {
      updateActiveTabBounds();
      syncFloatingModalWindowBounds();
    }, 50);
  });

  mainWindow.on('unmaximize', () => {
    persistMainWindowState(true);
    setTimeout(() => {
      updateActiveTabBounds();
      syncFloatingModalWindowBounds();
      persistMainWindowState(true);
    }, 50);
  });

  mainWindow.on('closed', () => {
    if (saveWindowStateTimeout) {
      clearTimeout(saveWindowStateTimeout);
      saveWindowStateTimeout = null;
    }
    hideTabDragGhost();
    stopTabDragGhostFollow();
    closeFloatingModal();
    if (floatingModalWindow && !floatingModalWindow.isDestroyed()) {
      floatingModalWindow.close();
    }
    if (tabDragGhostWindow && !tabDragGhostWindow.isDestroyed()) {
      tabDragGhostWindow.close();
    }
    mainWindow = null;
  });
  
  // Modificar el comportamiento al cerrar la ventana
  mainWindow.on('close', (event) => {
    persistMainWindowState(true);

    // En lugar de cerrar, ocultar la ventana si el tray está activo
    if (tray && !app.isQuitting) {
      event.preventDefault();
      closeFloatingModal();
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

function attachTabViewToMainWindow(view) {
  if (!mainWindow || !view || view.__attachedToMainWindow) return;

  mainWindow.contentView.addChildView(view);
  view.__attachedToMainWindow = true;
  activeMainContentView = view;
}

function detachTabViewFromMainWindow(view) {
  if (!mainWindow || !view || !view.__attachedToMainWindow) return;

  mainWindow.contentView.removeChildView(view);
  view.__attachedToMainWindow = false;

  if (activeMainContentView === view) {
    activeMainContentView = null;
  }
}

// Función auxiliar para crear una WebContentsView
function createWebContentsView(options = {}) {
  const userAgent = getEffectiveUserAgent();
  const appId = options.appId || null;
  const partition = options.partition || APP_SESSION_PARTITION;
  const isPrimary = Boolean(options.isPrimary);
  
  const view = new WebContentsView({
    webPreferences: {
      partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: true,
      webSecurity: true,
      nativeWindowOpen: true,
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

// Crea una nueva pestaña (WebContentsView) con la URL indicada
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

  
  const view = createWebContentsView({ partition, appId, isPrimary });

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
    switchTab(tabId);
  }
  
  // Cargar la URL
  view.webContents.loadURL(url);

  const updateTabUrl = (nextUrl) => {
    if (!nextUrl || nextUrl === 'about:blank') return;
    const previousUrls = [tab.url, tab.restorableUrl];
    const sanitizedUrl = sanitizeRestorableUrl(nextUrl);
    tab.url = sanitizedUrl;

    if (isOfficeDocumentUrl(nextUrl)) {
      tab.restorableUrl = sanitizedUrl;
      updateFavoriteEntryForTab(tab, previousUrls);
      return;
    }

    if (!tab.restorableUrl || !isOfficeDocumentUrl(tab.restorableUrl)) {
      tab.restorableUrl = sanitizedUrl;
    }

    updateFavoriteEntryForTab(tab, previousUrls);
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
    updateFavoriteEntryForTab(tab);
    sendTabsUpdate();
  });
  
  // Actualizar pestañas después de cargar
  view.webContents.on('did-finish-load', () => {
    
    // Si esta pestaña debe ser activa, asegurarse de activarla de nuevo
    if (makeActive && tabManager.activeTabId === tabId) {
      attachTabViewToMainWindow(view);
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
  
  if (tabManager.activeTabId) {
    let current = tabManager.tabs.find(tab => tab.id === tabManager.activeTabId);
    if (current) {
      detachTabViewFromMainWindow(current.view);
    }
  }
  
  tabManager.activeTabId = tabId;
  let newActive = tabManager.tabs.find(tab => tab.id === tabId);
  
  if (newActive) {
    attachTabViewToMainWindow(newActive.view);
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
    detachTabViewFromMainWindow(tab.view);
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
      isPrimary: Boolean(tab.isPrimary),
      isFavorite: isFavoriteTab(tab)
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
  hideTabDragGhost();
  detachTabToWindow(tabId);
});

ipcMain.on('show-tab-drag-ghost', (event, payload) => {
  showTabDragGhost(payload);
});

ipcMain.on('move-tab-drag-ghost', (event, payload) => {
  moveTabDragGhost(payload);
});

ipcMain.on('hide-tab-drag-ghost', () => {
  hideTabDragGhost();
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

ipcMain.on('toggle-floating-modal', (event, config) => {
  toggleFloatingModal(config || {});
});

ipcMain.on('open-floating-modal', (event, config) => {
  const type = config && typeof config.type === 'string' ? config.type : null;
  const payload = config && typeof config.payload === 'object' ? config.payload : {};
  if (!type) return;
  openFloatingModal(type, payload);
});

ipcMain.on('close-floating-modal', () => {
  closeFloatingModal();
});

ipcMain.on('floating-tab-info:hover', (_event, payload = {}) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('tab-info-hover-state', { inside: Boolean(payload.inside) });
});

ipcMain.on('floating-tab-info:toggle-favorite', (_event, payload = {}) => {
  const result = toggleFavoriteForTab(Number(payload.tabId));
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tab-info-favorite-toggle', result);
  }
  sendTabsUpdate();
});

ipcMain.on('floating-tab-info:detach', (_event, payload = {}) => {
  closeFloatingModal();
  detachTabToWindow(Number(payload.tabId));
});

ipcMain.handle('floating-modal:get-state', () => {
  return floatingModalState;
});

ipcMain.on('floating-modal:notify', (event, payload) => {
  if (!payload || !payload.message) return;
  showWebNotification(payload.message, payload.type || 'info');
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
  const iconPath = path.join(__dirname, 'icons', 'icon.png');
  tray = new Tray(iconPath);

  tray.setToolTip('O365 Linux Desktop');
  rebuildTrayMenu();

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
