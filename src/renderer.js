/**
 * Renderer principal para Microsoft 365 Copilot
 * Gestiona la interfaz de usuario y la interacción con el proceso principal.
 */

// Elementos del DOM
const tabsContainer = document.getElementById('tabs');
const tabsArea = document.getElementById('tabs-area');
const tabOverflowNav = document.getElementById('tab-overflow-nav');
const tabsNavLeftBtn = document.getElementById('tabs-nav-left');
const tabsNavRightBtn = document.getElementById('tabs-nav-right');
const newTabBtn = document.getElementById('new-tab-btn');
const settingsBtn = document.getElementById('settings-btn');
const notificationContainer = document.getElementById('notification-container');
let currentTabsData = [];
let currentActiveTabId = null;
let tabDragState = null;
let suppressClickTabId = null;
let managedVisibleStartIndex = 0;
const TAB_INFO_OPEN_DELAY = 1000;
const TAB_INFO_CLOSE_DELAY = 500;
const favoriteTabIds = new Set();
const tabInfoState = {
  primed: false,
  visible: false,
  hoveredTabId: null,
  currentTabId: null,
  anchorElement: null,
  pointerInsideCard: false
};
let tabInfoOpenTimer = null;
let tabInfoCloseTimer = null;

const TAB_WIDTH = 180;
const TAB_GAP = 2;
const TAB_SLOT_WIDTH = TAB_WIDTH + TAB_GAP;
const TAB_OVERFLOW_NAV_WIDTH = 58;

function applyTheme(theme) {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;

  const content = document.createElement('div');
  content.className = 'notification-content';
  content.textContent = message;

  const closeBtn = document.createElement('div');
  closeBtn.className = 'notification-close';
  closeBtn.innerHTML = '<span class="material-symbols-rounded">close</span>';
  closeBtn.addEventListener('click', () => {
    notification.classList.remove('visible');
    setTimeout(() => notification.remove(), 300);
  });

  notification.appendChild(content);
  notification.appendChild(closeBtn);
  notificationContainer.appendChild(notification);

  setTimeout(() => notification.classList.add('visible'), 10);

  setTimeout(() => {
    if (document.body.contains(notification)) {
      notification.classList.remove('visible');
      setTimeout(() => notification.remove(), 300);
    }
  }, 5000);
}

function cancelTabInfoOpenTimer() {
  if (tabInfoOpenTimer) {
    window.clearTimeout(tabInfoOpenTimer);
    tabInfoOpenTimer = null;
  }
}

function cancelTabInfoCloseTimer() {
  if (tabInfoCloseTimer) {
    window.clearTimeout(tabInfoCloseTimer);
    tabInfoCloseTimer = null;
  }
}

function getTabById(tabId) {
  return currentTabsData.find((tab) => tab.id === tabId) || null;
}

function getTabElementById(tabId) {
  return tabsContainer.querySelector(`.tab[data-tab-id="${tabId}"]`);
}

function getTabInfoTitle(tab) {
  return tab.fullTitle || tab.title || tab.url || 'Sin título';
}

function isTechnicalOfficeUrl(rawUrl = '') {
  const value = String(rawUrl || '').toLowerCase();
  if (!value) return false;

  return [
    '/_layouts/15/doc.aspx',
    '/_layouts/15/doc2.aspx',
    '/_layouts/15/wopiframe.aspx',
    '/guestaccess.aspx',
    'wopiframe',
    'guestaccess.aspx',
    'doc.aspx',
    'doc2.aspx',
    '_layouts/15'
  ].some((pattern) => value.includes(pattern));
}

function isRawUrlLike(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('file://');
}

function isTechnicalTabTitle(rawTitle = '') {
  const value = String(rawTitle || '').trim();
  if (!value) return true;

  const normalized = value.toLowerCase();

  if (isRawUrlLike(value)) return true;
  if (normalized === 'continue' || normalized === 'working...') return true;

  return [
    '/_layouts/15/doc.aspx',
    '/_layouts/15/doc2.aspx',
    '/_layouts/15/wopiframe.aspx',
    'wopiframe',
    'guestaccess.aspx',
    'doc.aspx',
    'doc2.aspx',
    '?resid=',
    '&resid=',
    'login.live.com/',
    'login.microsoftonline.com/'
  ].some((pattern) => normalized.includes(pattern));
}

function cleanTabTitle(rawTitle = '') {
  const title = String(rawTitle || '').trim();
  if (!title) return '';

  const cleanedTitle = title
    .replace(/\s*[|·-]\s*(microsoft\s*365|onedrive|sharepoint|outlook|teams|word|excel|powerpoint|onenote|office)\s*$/i, '')
    .replace(/^continue$/i, '')
    .replace(/^working\.\.\.$/i, '')
    .trim();

  if (!cleanedTitle || isTechnicalTabTitle(cleanedTitle)) {
    return '';
  }

  return cleanedTitle;
}

function sanitizeFileNameCandidate(value = '') {
  const candidate = String(value || '').trim();
  if (!candidate) return '';

  const cleanedCandidate = candidate
    .replace(/[?#].*$/, '')
    .trim();

  if (!cleanedCandidate || isTechnicalTabTitle(cleanedCandidate)) {
    return '';
  }

  return cleanedCandidate;
}

function extractFullFileName(rawUrl = '') {
  const value = String(rawUrl || '').trim();
  if (!value) return '';

  const tryDecode = (input) => {
    try {
      return decodeURIComponent(input);
    } catch (error) {
      return input;
    }
  };

  const getLastSegment = (input) => {
    const decodedInput = tryDecode(String(input || ''));
    const normalizedInput = decodedInput.replace(/\\/g, '/');
    const segments = normalizedInput.split('/').filter(Boolean);
    const lastSegment = segments.pop() || '';
    return sanitizeFileNameCandidate(lastSegment);
  };

  if (/^file:\/\//i.test(value)) {
    try {
      const parsedUrl = new URL(value);
      return getLastSegment(parsedUrl.pathname);
    } catch (error) {
      return getLastSegment(value.replace(/^file:\/\//i, ''));
    }
  }

  if (/^[a-zA-Z]:[\/]/.test(value) || value.startsWith('\\')) {
    return getLastSegment(value);
  }

  try {
    const parsedUrl = new URL(value);

    for (const key of ['file', 'filename', 'name']) {
      const paramValue = parsedUrl.searchParams.get(key);
      const inferredFromParam = getLastSegment(paramValue);
      if (inferredFromParam) {
        return inferredFromParam;
      }
    }

    return getLastSegment(parsedUrl.pathname);
  } catch (error) {
    return getLastSegment(value);
  }
}

function isPdfTab(tab) {
  const lowerUrl = (tab.url || '').toLowerCase();
  const lowerTitle = getTabInfoTitle(tab).toLowerCase();
  return lowerUrl.includes('.pdf') || lowerTitle.includes('.pdf') || lowerTitle.endsWith('pdf');
}

function getTabServiceKey(tab) {
  const lowerUrl = (tab.url || '').toLowerCase();
  const lowerTitle = getTabInfoTitle(tab).toLowerCase();
  const iconPath = getTabIconPath(tab.url || '', getTabInfoTitle(tab));

  if (lowerUrl.startsWith('file://')) return 'local';
  if (isPdfTab(tab)) return 'pdf';
  if (iconPath?.includes('word.png')) return 'word';
  if (iconPath?.includes('excel.png')) return 'excel';
  if (iconPath?.includes('powerpoint.png')) return 'powerpoint';
  if (iconPath?.includes('onenote.png')) return 'onenote';
  if (iconPath?.includes('onedrive.png')) return 'onedrive';
  if (iconPath?.includes('outlook.png')) return 'outlook';
  if (iconPath?.includes('teams.png')) return 'teams';
  if (iconPath?.includes('sharepoint.png')) return 'sharepoint';
  if (lowerUrl.includes('sharepoint')) return 'sharepoint';
  if (lowerUrl.includes('onedrive')) return 'onedrive';
  if (lowerUrl.includes('outlook')) return 'outlook';
  if (lowerUrl.includes('teams')) return 'teams';
  if (lowerTitle.includes('copilot') || lowerUrl.includes('m365.cloud.microsoft')) return 'cloud';
  return 'cloud';
}

function getServiceLabel(serviceKey) {
  const labels = {
    local: 'Equipo local',
    pdf: 'PDF',
    word: 'Word',
    excel: 'Excel',
    powerpoint: 'PowerPoint',
    onenote: 'OneNote',
    onedrive: 'OneDrive',
    outlook: 'Outlook',
    teams: 'Teams',
    sharepoint: 'SharePoint',
    cloud: 'Cloud'
  };

  return labels[serviceKey] || 'Cloud';
}

function formatLocationSegment(segment = '') {
  return String(segment || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTechnicalPathSegment(segment = '') {
  const value = String(segment || '').trim().toLowerCase();
  if (!value) return true;

  if ([
    '_layouts',
    '15',
    'doc.aspx',
    'doc2.aspx',
    'wopiframe.aspx',
    'guestaccess.aspx',
    '_forms',
    'forms',
    'default.aspx',
    'allitems.aspx',
    'personal',
    'sites',
    'documents',
    'documentos',
    'shared documents',
    'shared%20documents',
    'onedrive.aspx',
    'sharepoint.aspx'
  ].includes(value)) {
    return true;
  }

  if (/^[0-9a-f]{16,}$/i.test(value)) return true;
  if (/^[0-9a-f-]{24,}$/i.test(value)) return true;
  if (value.includes('@') || value.includes('.sharepoint.com')) return true;
  return false;
}

function uniqueSegments(segments = []) {
  const seen = new Set();
  return segments.filter((segment) => {
    const key = segment.toLowerCase();
    if (!segment || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractFriendlySegmentsFromPath(rawPath = '') {
  return String(rawPath || '')
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch (error) {
        return segment;
      }
    })
    .map((segment) => formatLocationSegment(segment))
    .filter((segment) => !isTechnicalPathSegment(segment));
}

function getCloudRootLabel(serviceKey, hostname = '') {
  if (serviceKey === 'onedrive') return 'OneDrive';
  if (serviceKey === 'sharepoint') return 'SharePoint';
  if (serviceKey === 'outlook') return 'Outlook';
  if (serviceKey === 'teams') return 'Teams';
  if (serviceKey === 'local') return 'Equipo local';

  if (hostname.includes('onedrive')) return 'OneDrive';
  if (hostname.includes('sharepoint')) return 'SharePoint';
  return getServiceLabel(serviceKey);
}

function getFriendlyCloudLocation(serviceKey, rawUrl = '', fallbackTitle = '') {
  try {
    const parsedUrl = new URL(rawUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    const rootLabel = getCloudRootLabel(serviceKey, hostname);
    const pathSegments = [];

    pathSegments.push(...extractFriendlySegmentsFromPath(parsedUrl.pathname));

    ['id', 'parent', 'rootfolder', 'file', 'filepath'].forEach((key) => {
      const value = parsedUrl.searchParams.get(key);
      if (!value) return;
      pathSegments.push(...extractFriendlySegmentsFromPath(value));
    });

    if (serviceKey === 'sharepoint') {
      const siteName = formatLocationSegment(hostname.split('.')[0]?.replace(/-my$/i, '') || '');
      if (siteName && siteName.toLowerCase() !== 'sharepoint') {
        pathSegments.unshift(siteName);
      }
    }

    const cleanedSegments = uniqueSegments(pathSegments);

    if (cleanedSegments.length > 0) {
      return cleanedSegments.join(' > ');
    }

    const cleanedTitle = cleanTabTitle(fallbackTitle);
    if (cleanedTitle) {
      return cleanedTitle;
    }

    if (serviceKey === 'outlook') return 'Buzón';
    if (serviceKey === 'teams') return 'Espacio de trabajo';
    return 'Ubicación no disponible';
  } catch (error) {
    const cleanedTitle = cleanTabTitle(fallbackTitle);
    return cleanedTitle || 'Ubicación no disponible';
  }
}

function inferTabLocation(tab, serviceKey) {
  const rawUrl = tab.url || '';

  if (rawUrl.startsWith('file://')) {
    try {
      const parsedUrl = new URL(rawUrl);
      const localPath = decodeURIComponent(parsedUrl.pathname);
      const parts = localPath.split('/').filter(Boolean);
      const locationParts = parts.length > 1 ? parts.slice(-2, -1) : parts;
      return {
        icon: 'computer',
        text: locationParts.length ? locationParts.join(' > ') : (localPath || 'Ubicación no disponible'),
        isCloud: false
      };
    } catch (error) {
      return {
        icon: 'computer',
        text: 'Ubicación no disponible',
        isCloud: false
      };
    }
  }

  return {
    icon: 'cloud',
    text: getFriendlyCloudLocation(serviceKey, rawUrl, getTabInfoTitle(tab)),
    isCloud: true
  };
}

function getLastSavedValue(tab) {
  if (tab.lastSaved) return tab.lastSaved;
  if (tab.savedAt) return tab.savedAt;
  if (tab.lastModified) return tab.lastModified;
  return 'No disponible';
}

function normalizeTabInfo(tab) {
  if (!tab) return null;

  const serviceKey = getTabServiceKey(tab);
  const service = getServiceLabel(serviceKey);
  const rawTitle = getTabInfoTitle(tab);
  const cleanedTitle = cleanTabTitle(rawTitle);
  const fullFileName = extractFullFileName(tab.url || '');
  const fallbackTitle = service === 'Equipo local' ? 'Archivo local' : service;
  const title = cleanedTitle || fullFileName || fallbackTitle;
  const location = inferTabLocation(tab, serviceKey);
  const iconPath = getTabIconPath(tab.url || '', rawTitle);
  const iconSymbol = iconPath ? null : getTabIconSymbol(tab.url || '', rawTitle);

  if (!title || isTechnicalTabTitle(title)) return null;

  return {
    title,
    source: service,
    location: location.text || 'Ubicación no disponible',
    locationIcon: location.icon,
    isCloud: location.isCloud,
    lastSaved: getLastSavedValue(tab),
    iconPath,
    iconSymbol,
    iconType: serviceKey
  };
}

function buildTabInfoPayload(tab, anchorElement = tabInfoState.anchorElement) {
  if (!tab || !anchorElement) return null;

  const friendlyInfo = normalizeTabInfo(tab);
  if (!friendlyInfo) return null;

  const anchorRect = anchorElement.getBoundingClientRect();

  return {
    tabId: tab.id,
    title: friendlyInfo.title,
    service: friendlyInfo.source,
    locationIcon: friendlyInfo.locationIcon,
    locationText: friendlyInfo.location,
    lastSaved: friendlyInfo.lastSaved,
    iconPath: friendlyInfo.iconPath,
    iconSymbol: friendlyInfo.iconSymbol,
    isFavorite: favoriteTabIds.has(tab.id),
    isPrimary: Boolean(tab.isPrimary),
    anchorRect: {
      left: anchorRect.left,
      top: anchorRect.top,
      right: anchorRect.right,
      bottom: anchorRect.bottom,
      width: anchorRect.width,
      height: anchorRect.height
    }
  };
}

function refreshVisibleTabInfoCard() {
  if (!tabInfoState.visible || tabInfoState.currentTabId == null) return;

  const nextTab = getTabById(tabInfoState.currentTabId);
  const nextAnchorElement = getTabElementById(tabInfoState.currentTabId);

  if (!nextTab || !nextAnchorElement) {
    hideTabInfoCard(true);
    return;
  }

  tabInfoState.anchorElement = nextAnchorElement;
  const payload = buildTabInfoPayload(nextTab, nextAnchorElement);
  if (payload) {
    window.electronAPI.openFloatingModal({ type: 'tab-info', payload });
  }
}

function hideTabInfoCard(resetState = false) {
  cancelTabInfoOpenTimer();
  cancelTabInfoCloseTimer();

  if (tabInfoState.visible || tabInfoState.currentTabId != null) {
    window.electronAPI.closeFloatingModal();
  }

  tabInfoState.visible = false;
  tabInfoState.currentTabId = null;
  tabInfoState.anchorElement = null;

  if (resetState) {
    tabInfoState.primed = false;
    tabInfoState.hoveredTabId = null;
    tabInfoState.pointerInsideCard = false;
  }
}

function showTabInfoCard(tab, anchorElement) {
  const payload = buildTabInfoPayload(tab, anchorElement);
  if (!tab || !anchorElement || !payload) return;

  cancelTabInfoOpenTimer();
  cancelTabInfoCloseTimer();
  tabInfoState.visible = true;
  tabInfoState.primed = true;
  tabInfoState.currentTabId = tab.id;
  tabInfoState.hoveredTabId = tab.id;
  tabInfoState.anchorElement = anchorElement;

  window.electronAPI.openFloatingModal({
    type: 'tab-info',
    payload
  });
}

function scheduleTabInfoCardOpen(tab, anchorElement) {
  cancelTabInfoOpenTimer();
  cancelTabInfoCloseTimer();
  tabInfoState.hoveredTabId = tab.id;
  tabInfoState.anchorElement = anchorElement;

  if (tabInfoState.primed || tabInfoState.visible) {
    showTabInfoCard(tab, anchorElement);
    return;
  }

  tabInfoOpenTimer = window.setTimeout(() => {
    tabInfoOpenTimer = null;
    const latestTab = getTabById(tab.id);
    const latestAnchorElement = getTabElementById(tab.id);

    if (!latestTab || !latestAnchorElement || tabInfoState.hoveredTabId !== tab.id) {
      return;
    }

    showTabInfoCard(latestTab, latestAnchorElement);
  }, TAB_INFO_OPEN_DELAY);
}

function scheduleTabInfoCardClose() {
  cancelTabInfoOpenTimer();
  cancelTabInfoCloseTimer();

  if (!tabInfoState.visible) {
    tabInfoState.hoveredTabId = null;
    return;
  }

  tabInfoCloseTimer = window.setTimeout(() => {
    tabInfoCloseTimer = null;
    hideTabInfoCard(true);
  }, TAB_INFO_CLOSE_DELAY);
}

function handleTabInfoEnter(tab, tabElement) {
  if (tab.isPrimary) {
    hideTabInfoCard(true);
    return;
  }

  if (tabDragState?.active) return;
  scheduleTabInfoCardOpen(tab, tabElement);
}

function handleTabInfoLeave(tab) {
  if (tabInfoState.hoveredTabId === tab.id) {
    tabInfoState.hoveredTabId = null;
  }

  if (tabInfoState.pointerInsideCard) {
    cancelTabInfoOpenTimer();
    cancelTabInfoCloseTimer();
    return;
  }

  scheduleTabInfoCardClose();
}

function syncTabInfoCardAfterRender() {
  if (tabInfoState.visible && tabInfoState.currentTabId != null) {
    refreshVisibleTabInfoCard();
    return;
  }

  if (tabInfoOpenTimer && tabInfoState.hoveredTabId != null) {
    const nextAnchorElement = getTabElementById(tabInfoState.hoveredTabId);
    if (nextAnchorElement) {
      tabInfoState.anchorElement = nextAnchorElement;
    } else {
      cancelTabInfoOpenTimer();
      tabInfoState.hoveredTabId = null;
    }
  }
}

// Crear elemento para una pestaña
function createTabElement(tab, isActive, index) {
  const tabElement = document.createElement('div');
  tabElement.className = 'tab';
  tabElement.dataset.tabId = String(tab.id);
  if (isActive) tabElement.classList.add('active');
  if (tab.isPrimary) tabElement.classList.add('primary');
  
  // Detectar si es una pestaña de Copilot
  const isCopilot = tab.url.includes('m365.cloud.microsoft') || 
                   tab.url.includes('copilot') || 
                   tab.title.toLowerCase().includes('copilot');
  
  if (isCopilot && !tab.isPrimary) {
    tabElement.classList.add('copilot');
  }
  
  // Crear ícono
  const tabIcon = document.createElement('div');
  tabIcon.className = 'tab-icon';
  
  // Obtener ruta del ícono basado en URL/título
  const iconPath = getTabIconPath(tab.url, tab.fullTitle || tab.title);
  
  // Si tenemos un ícono en la carpeta icons, usarlo
  if (iconPath) {
    tabIcon.innerHTML = `<img src="${iconPath}" alt="" width="16" height="16">`;
  } else {
    // Fallback a ícono de Material Symbols
    const iconSymbol = getTabIconSymbol(tab.url, tab.fullTitle || tab.title);
    tabIcon.innerHTML = `<span class="material-symbols-rounded">${iconSymbol}</span>`;
  }
  
  // Título de la pestaña
  const tabTitle = document.createElement('div');
  tabTitle.className = 'tab-title';
  tabTitle.textContent = tab.isPrimary ? 'M365 Copilot' : (tab.title || tab.url);
  
  // Acciones de la pestaña
  const tabActions = document.createElement('div');
  tabActions.className = 'tab-actions';
  
  // Botón de recargar
  const reloadBtn = document.createElement('button');
  reloadBtn.className = 'tab-reload';
  reloadBtn.innerHTML = '<span class="material-symbols-rounded">refresh</span>';
  reloadBtn.title = 'Recargar';
  reloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.electronAPI.reloadTab(tab.id);
  });
  
  // Botón de cerrar
  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.innerHTML = '<span class="material-symbols-rounded">close</span>';
  closeBtn.title = 'Cerrar';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.electronAPI.closeTab(tab.id);
  });
  
  // Añadir elementos a la pestaña
  tabActions.appendChild(reloadBtn);
  if (!tab.isPrimary) {
    tabActions.appendChild(closeBtn);
  }
  
  tabElement.appendChild(tabIcon);
  tabElement.appendChild(tabTitle);
  tabElement.appendChild(tabActions);
  
  // Al hacer clic, cambia a esa pestaña
  tabElement.addEventListener('click', () => {
    if (suppressClickTabId === tab.id) {
      suppressClickTabId = null;
      return;
    }
    window.electronAPI.switchTab(tab.id);
  });

  tabElement.addEventListener('mouseenter', () => {
    handleTabInfoEnter(tab, tabElement);
  });

  tabElement.addEventListener('mouseleave', () => {
    handleTabInfoLeave(tab);
  });

  if (!tab.isPrimary) {
    tabElement.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('.tab-actions')) return;
      hideTabInfoCard(true);
      startTabPointerDrag(event, tabElement, tab);
    });
  }
  
  return tabElement;
}

// Obtener ruta del ícono basado en URL o título
function getTabIconPath(url, title) {
  const lowerUrl = (url || '').toLowerCase();
  const lowerTitle = (title || '').toLowerCase();

  // Función auxiliar para detectar tipo de archivo por extensión
  function hasFileExtension(ext) {
    return lowerTitle.includes(ext) || lowerUrl.includes(ext);
  }

  // Función auxiliar para detectar patrones de Office online
  function hasOfficePattern(patterns) {
    return patterns.some(pattern =>
      lowerUrl.includes(pattern) || lowerTitle.includes(pattern)
    );
  }

  function hasFileHint(extensions) {
    return extensions.some((extension) =>
      lowerUrl.includes(`ithint=file%2c${extension}`) ||
      lowerUrl.includes(`ithint=file,${extension}`) ||
      lowerUrl.includes(`filetype=${extension}`) ||
      lowerUrl.includes(`.${extension}&`) ||
      lowerUrl.endsWith(`.${extension}`)
    );
  }

  // Priorizar detección por título y extensión del archivo
  const isWordFile = hasFileExtension('.doc') || hasFileExtension('.docx') ||
    hasFileHint(['doc', 'docx', 'dot', 'dotx']) ||
    hasOfficePattern(['word', 'document', 'word-edit', 'word-view', 'word-online', '/:w:/', 'app=word']) ||
    (lowerUrl.includes('/_layouts/15/wopiframe.aspx') && lowerUrl.includes('doc'));

  const isExcelFile = hasFileExtension('.xls') || hasFileExtension('.xlsx') || hasFileExtension('.xlsm') ||
    hasFileHint(['xls', 'xlsx', 'xlsm', 'xltx', 'csv']) ||
    hasOfficePattern(['excel', 'spreadsheet', 'workbook', 'excel-edit', 'excel-view', 'excel-online', '/:x:/', 'app=excel', 'xlviewer.aspx']) ||
    (lowerUrl.includes('/_layouts/15/wopiframe.aspx') && lowerUrl.includes('xls'));

  const isPowerPointFile = hasFileExtension('.ppt') || hasFileExtension('.pptx') ||
    hasFileHint(['ppt', 'pptx', 'pot', 'potx']) ||
    hasOfficePattern(['powerpoint', 'presentation', 'powerpoint-edit', 'powerpoint-view', 'powerpoint-online', '/:p:/', 'app=powerpoint']) ||
    (lowerUrl.includes('/_layouts/15/wopiframe.aspx') && lowerUrl.includes('ppt'));

  const isOneNoteFile = hasFileExtension('.one') ||
    hasFileHint(['one']) ||
    hasOfficePattern(['onenote', 'bloc de notas', 'onenote-online', '/:o:/', 'app=onenote']);

  // Servicios específicos (solo si no son archivos de Office)
  const isOutlookPage = hasOfficePattern(['outlook', '/mail', '/owa/', 'office365.com/mail', 'correo']) &&
    !isWordFile && !isExcelFile && !isPowerPointFile && !isOneNoteFile;

  const isOneDriveFolder = hasOfficePattern(['onedrive', 'onedrive.live.com', '/personal/', '/files/']) &&
    !isWordFile && !isExcelFile && !isPowerPointFile && !isOneNoteFile;

  // Microsoft Word
  if (isWordFile) {
    return '../icons/word.png';
  }
  // Microsoft Excel
  else if (isExcelFile) {
    return '../icons/excel.png';
  }
  // Microsoft PowerPoint
  else if (isPowerPointFile) {
    return '../icons/powerpoint.png';
  }
  // Microsoft OneNote
  else if (isOneNoteFile) {
    return '../icons/onenote.png';
  }
  // Microsoft OneDrive
  else if (isOneDriveFolder) {
    return '../icons/onedrive.png';
  }
  // Microsoft Outlook
  else if (isOutlookPage) {
    return '../icons/outlook.png';
  }
  // Microsoft Teams
  else if (lowerUrl.includes('teams') || lowerTitle.includes('teams') ||
           lowerUrl.includes('equipo')) {
    return '../icons/teams.png';
  }
  // Microsoft SharePoint
  else if (lowerUrl.includes('sharepoint') || lowerTitle.includes('sharepoint') ||
           lowerUrl.includes('/sites/') || lowerTitle.includes('sitio')) {
    return '../icons/sharepoint.png';
  }
  // Microsoft To Do
  else if (lowerUrl.includes('to-do') || lowerTitle.includes('to-do') ||
           lowerUrl.includes('to-do.office')) {
    return '../icons/todo.png';
  }
  // Centro de administración
  else if (lowerUrl.includes('admin') || lowerTitle.includes('admin') ||
           lowerTitle.includes('administra') || lowerUrl.includes('/adminportal/') ||
           lowerUrl.includes('/admincenter/')) {
    return '../icons/admin.png';
  }
  // Microsoft Copilot
  else if (lowerUrl.includes('copilot') || lowerTitle.includes('copilot') ||
           lowerUrl.includes('m365.cloud')) {
    return '../icons/icon.png';
  }
  // Para otros casos, devolvemos null y se usará un ícono de Material Symbols
  else {
    return null;
  }
}

// Obtener símbolo de Material Symbols como fallback
function getTabIconSymbol(url, title) {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = (title || '').toLowerCase();
  
  // Copilot
  if (lowerUrl.includes('m365.cloud.microsoft') || 
      lowerUrl.includes('copilot') || 
      lowerTitle.includes('copilot')) {
    return 'smart_toy';
  } 
  // SharePoint
  else if (lowerUrl.includes('sharepoint') || 
           lowerTitle.includes('sharepoint') ||
           lowerUrl.includes('/sites/')) {
    return 'cloud';
  } 
  // Centro de administración
  else if (lowerUrl.includes('admin') || 
           lowerTitle.includes('admin') || 
           lowerTitle.includes('administra')) {
    return 'admin_panel_settings';
  }
  // Office.com 
  else if (lowerUrl.includes('office.com') || 
           lowerTitle.includes('office')) {
    return 'apps';
  }
  // Microsoft Account
  else if (lowerUrl.includes('account.microsoft') || 
           lowerTitle.includes('cuenta')) {
    return 'person';
  }
  // Login
  else if (lowerUrl.includes('login') || 
           lowerTitle.includes('iniciar sesión') ||
           lowerTitle.includes('sign in')) {
    return 'login';
  }
  // Documentos
  else if (lowerUrl.includes('document') || 
           lowerTitle.includes('documento')) {
    return 'description';
  }
  // Otros
  else {
    return 'public';
  }
}

// Actualizar la UI de pestañas cuando cambian
function updateTabsUI(data) {
  if (tabDragState && tabDragState.active) {
    currentTabsData = data.tabs;
    currentActiveTabId = data.activeTabId;
    syncFavoriteTabIds(currentTabsData);
    return;
  }

  currentTabsData = data.tabs;
  currentActiveTabId = data.activeTabId;
  syncFavoriteTabIds(currentTabsData);
  syncManagedVisibleWindow();
  renderVisibleTabs();
}

function getPrimaryTab(data = currentTabsData) {
  return data.find((tab) => tab.isPrimary) || null;
}

function getManagedTabs(data = currentTabsData) {
  return data.filter((tab) => !tab.isPrimary);
}

function syncFavoriteTabIds(tabs = currentTabsData) {
  favoriteTabIds.clear();
  tabs.forEach((tab) => {
    if (tab.isFavorite) {
      favoriteTabIds.add(tab.id);
    }
  });
}

function getOuterWidth(element) {
  if (!element) return 0;

  const rect = element.getBoundingClientRect();
  const styles = window.getComputedStyle(element);
  return rect.width + Number.parseFloat(styles.marginLeft || '0') + Number.parseFloat(styles.marginRight || '0');
}

function getPrimaryTabWidth() {
  const primaryElement = tabsContainer.querySelector('.tab.primary');
  if (primaryElement) {
    return getOuterWidth(primaryElement);
  }

  return TAB_SLOT_WIDTH;
}

function getVisibleManagedCapacity(managedTabsCount, reserveForOverflowNav) {
  if (!managedTabsCount) return 0;

  const availableWidth = Math.max(
    0,
    tabsArea.clientWidth -
      getOuterWidth(newTabBtn) -
      getPrimaryTabWidth() -
      (reserveForOverflowNav ? TAB_OVERFLOW_NAV_WIDTH : 0)
  );

  return Math.max(1, Math.floor((availableWidth + TAB_GAP) / TAB_SLOT_WIDTH));
}

function getManagedWindowMetrics(data = currentTabsData) {
  const managedTabs = getManagedTabs(data);
  const primaryTab = getPrimaryTab(data);
  const capacityWithoutOverflowNav = getVisibleManagedCapacity(managedTabs.length, false);
  const hasOverflow = Boolean(primaryTab) && managedTabs.length > capacityWithoutOverflowNav;
  const visibleCount = hasOverflow
    ? Math.min(managedTabs.length, getVisibleManagedCapacity(managedTabs.length, true))
    : managedTabs.length;
  const maxStart = Math.max(0, managedTabs.length - visibleCount);

  return {
    primaryTab,
    managedTabs,
    hasOverflow,
    visibleCount,
    maxStart
  };
}

function syncManagedVisibleWindow(preferredStart = managedVisibleStartIndex, ensureActiveVisible = true) {
  const { managedTabs, visibleCount, maxStart } = getManagedWindowMetrics();
  if (!managedTabs.length || !visibleCount) {
    managedVisibleStartIndex = 0;
    return;
  }

  let nextStart = Math.max(0, Math.min(preferredStart, maxStart));

  if (ensureActiveVisible) {
    const activeManagedIndex = managedTabs.findIndex((tab) => tab.id === currentActiveTabId);

    if (activeManagedIndex !== -1) {
      if (activeManagedIndex < nextStart) {
        nextStart = activeManagedIndex;
      } else if (activeManagedIndex >= nextStart + visibleCount) {
        nextStart = activeManagedIndex - visibleCount + 1;
      }
    }
  }

  managedVisibleStartIndex = Math.max(0, Math.min(nextStart, maxStart));
}

function updateOverflowControls(metrics) {
  const { hasOverflow, visibleCount, managedTabs, maxStart } = metrics;

  tabOverflowNav.classList.toggle('is-hidden', !hasOverflow);

  if (!hasOverflow) {
    tabsNavLeftBtn.disabled = true;
    tabsNavRightBtn.disabled = true;
    return;
  }

  tabsNavLeftBtn.disabled = managedVisibleStartIndex <= 0;
  tabsNavRightBtn.disabled = managedVisibleStartIndex >= maxStart || managedVisibleStartIndex + visibleCount >= managedTabs.length;
}

function renderVisibleTabs() {
  const metrics = getManagedWindowMetrics();
  const { primaryTab, managedTabs, visibleCount } = metrics;
  const visibleManagedTabs = managedTabs.slice(
    managedVisibleStartIndex,
    managedVisibleStartIndex + visibleCount
  );

  tabsContainer.innerHTML = '';

  const tabsToRender = [
    ...(primaryTab ? [primaryTab] : []),
    ...visibleManagedTabs
  ];

  tabsToRender.forEach((tab, index) => {
    const isActive = tab.id === currentActiveTabId;
    const tabElement = createTabElement(tab, isActive, index);
    tabsContainer.appendChild(tabElement);
  });

  updateOverflowControls(metrics);
  syncTabInfoCardAfterRender();
}

function animateTabMutation(mutator) {
  const trackedElements = Array.from(tabsContainer.querySelectorAll('.tab'));
  const previousRects = new Map(
    trackedElements.map((element) => [element, element.getBoundingClientRect()])
  );

  mutator();

  const nextElements = Array.from(tabsContainer.querySelectorAll('.tab'));
  nextElements.forEach((element) => {
    const previousRect = previousRects.get(element);
    if (!previousRect) return;

    const nextRect = element.getBoundingClientRect();
    const deltaX = previousRect.left - nextRect.left;

    if (!deltaX) return;

    element.style.transition = 'none';
    element.style.transform = `translateX(${deltaX}px)`;

    requestAnimationFrame(() => {
      element.style.transition = '';
      element.style.transform = '';
    });
  });
}

function getTabOrderFromDom(draggedTabElement = null, placeholderElement = null) {
  const primaryIds = currentTabsData.filter((tab) => tab.isPrimary).map((tab) => tab.id);
  const managedTabs = getManagedTabs();
  const visibleManagedIds = Array.from(tabsContainer.querySelectorAll('.tab:not(.primary)'))
    .map((element) => {
      if (placeholderElement && element === placeholderElement) {
        return draggedTabElement;
      }
      return element;
    })
    .filter(Boolean)
    .map((element) => Number(element.dataset.tabId));

  const leftHiddenIds = managedTabs
    .slice(0, managedVisibleStartIndex)
    .map((tab) => tab.id);
  const rightHiddenIds = managedTabs
    .slice(managedVisibleStartIndex + visibleManagedIds.length)
    .map((tab) => tab.id);

  return [...primaryIds, ...leftHiddenIds, ...visibleManagedIds, ...rightHiddenIds];
}

function copyComputedStyles(sourceElement, targetElement) {
  const computedStyle = window.getComputedStyle(sourceElement);

  for (const propertyName of computedStyle) {
    targetElement.style.setProperty(
      propertyName,
      computedStyle.getPropertyValue(propertyName),
      computedStyle.getPropertyPriority(propertyName)
    );
  }

  const sourceChildren = Array.from(sourceElement.children);
  const targetChildren = Array.from(targetElement.children);

  sourceChildren.forEach((sourceChild, index) => {
    const targetChild = targetChildren[index];
    if (!targetChild) return;
    copyComputedStyles(sourceChild, targetChild);
  });
}

function createFloatingTabClone(tabElement, rect) {
  const floatingTabElement = tabElement.cloneNode(true);
  copyComputedStyles(tabElement, floatingTabElement);

  floatingTabElement.classList.add('tab-floating', 'dragging');
  floatingTabElement.style.position = 'fixed';
  floatingTabElement.style.left = `${rect.left}px`;
  floatingTabElement.style.top = `${rect.top}px`;
  floatingTabElement.style.width = `${rect.width}px`;
  floatingTabElement.style.minWidth = `${rect.width}px`;
  floatingTabElement.style.maxWidth = `${rect.width}px`;
  floatingTabElement.style.height = `${rect.height}px`;
  floatingTabElement.style.margin = '0';
  floatingTabElement.style.pointerEvents = 'none';
  floatingTabElement.style.transform = 'none';
  floatingTabElement.style.opacity = '1';
  floatingTabElement.style.zIndex = '1200';

  const actions = floatingTabElement.querySelector('.tab-actions');
  const sourceActions = tabElement.querySelector('.tab-actions');
  if (actions && sourceActions) {
    actions.style.opacity = window.getComputedStyle(sourceActions).opacity;
  }

  return floatingTabElement;
}

function updatePlaceholderPosition(pointerClientX) {
  if (!tabDragState || !tabDragState.active) return;

  const { placeholderElement, draggedTabElement } = tabDragState;
  const movableTabs = Array.from(
    tabsContainer.querySelectorAll('.tab:not(.primary):not(.tab-placeholder)')
  );

  const targetTab = movableTabs.find((element) => {
    const rect = element.getBoundingClientRect();
    return pointerClientX < rect.left + rect.width / 2;
  });

  animateTabMutation(() => {
    if (targetTab) {
      tabsContainer.insertBefore(placeholderElement, targetTab);
    } else {
      tabsContainer.appendChild(placeholderElement);
    }
  });

  tabsContainer.classList.toggle(
    'drop-at-end',
    placeholderElement === tabsContainer.lastElementChild
  );
  newTabBtn.classList.toggle(
    'drop-at-end',
    placeholderElement === tabsContainer.lastElementChild
  );
}

function isPointerInsideTabsArea(clientX, clientY) {
  const rect = tabsArea.getBoundingClientRect();
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

function getDetachedTabGhostTitle(tab) {
  return tab.fullTitle || tab.title || tab.url || 'Ventana separada';
}

function setFloatingTabVisibility(visible) {
  if (!tabDragState?.floatingTabElement) return;
  tabDragState.floatingTabElement.style.opacity = visible ? '1' : '0';
}

function showDetachedTabGhost(moveEvent, tab) {
  setFloatingTabVisibility(false);
  if (!window.electronAPI?.showTabDragGhost) return;

  window.electronAPI.showTabDragGhost({
    title: getDetachedTabGhostTitle(tab),
    screenX: moveEvent.screenX,
    screenY: moveEvent.screenY
  });
}

function moveDetachedTabGhost(moveEvent) {
  if (!window.electronAPI?.moveTabDragGhost) return;
  window.electronAPI.moveTabDragGhost({
    screenX: moveEvent.screenX,
    screenY: moveEvent.screenY
  });
}

function hideDetachedTabGhost() {
  setFloatingTabVisibility(true);
  if (!window.electronAPI?.hideTabDragGhost) return;
  window.electronAPI.hideTabDragGhost();
}

function finishTabPointerDrag(commitReorder, detachToWindow = false) {
  if (!tabDragState) return;

  const {
    active,
    tabId,
    draggedTabElement,
    floatingTabElement,
    placeholderElement,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    isOutsideTabsArea,
    pointerId
  } = tabDragState;

  document.removeEventListener('pointermove', handlePointerMove);
  document.removeEventListener('pointerup', handlePointerUp);
  document.removeEventListener('pointercancel', handlePointerCancel);

  if (draggedTabElement?.hasPointerCapture?.(pointerId)) {
    draggedTabElement.releasePointerCapture(pointerId);
  }
  document.body.classList.remove('tab-drag-active');
  tabsContainer.classList.remove('drop-at-end');
  newTabBtn.classList.remove('drop-at-end');

  if (active) {
    if (isOutsideTabsArea) {
      hideDetachedTabGhost();
    }

    const orderedIds = getTabOrderFromDom(draggedTabElement, placeholderElement);

    if (floatingTabElement) {
      floatingTabElement.remove();
    }
    if (placeholderElement) {
      placeholderElement.remove();
    }

    suppressClickTabId = tabId;
    const reorderedTabs = orderedIds
      .map((id) => currentTabsData.find((tab) => tab.id === id))
      .filter(Boolean);
    const optimisticData = {
      tabs: reorderedTabs.length === currentTabsData.length ? reorderedTabs : currentTabsData,
      activeTabId: currentActiveTabId
    };

    if (detachToWindow) {
      tabDragState = null;
      updateTabsUI({ tabs: currentTabsData, activeTabId: currentActiveTabId });
      window.electronAPI.detachTabToWindow(tabId);
    } else if (commitReorder) {
      const currentIds = currentTabsData.map((tab) => tab.id);
      const hasChanged = orderedIds.some((id, index) => id !== currentIds[index]);
      if (hasChanged) {
        tabDragState = null;
        updateTabsUI(optimisticData);
        window.electronAPI.reorderTabs(orderedIds);
      } else {
        tabDragState = null;
        updateTabsUI({ tabs: currentTabsData, activeTabId: currentActiveTabId });
      }
    } else {
      tabDragState = null;
      updateTabsUI({ tabs: currentTabsData, activeTabId: currentActiveTabId });
    }
  }
}

function activateTabPointerDrag() {
  if (!tabDragState || tabDragState.active) return;

  const {
    draggedTabElement,
    pointerOffsetX,
    pointerOffsetY,
    startClientX,
    startClientY
  } = tabDragState;

  const rect = draggedTabElement.getBoundingClientRect();
  const placeholderElement = document.createElement('div');
  placeholderElement.className = 'tab tab-placeholder';
  placeholderElement.style.width = `${rect.width}px`;
  placeholderElement.style.minWidth = `${rect.width}px`;
  placeholderElement.style.maxWidth = `${rect.width}px`;
  placeholderElement.style.height = `${rect.height}px`;

  animateTabMutation(() => {
    draggedTabElement.replaceWith(placeholderElement);
  });

  const floatingTabElement = createFloatingTabClone(draggedTabElement, rect);

  document.body.appendChild(floatingTabElement);
  document.body.classList.add('tab-drag-active');

  tabDragState.active = true;
  tabDragState.isOutsideTabsArea = false;
  tabDragState.placeholderElement = placeholderElement;
  tabDragState.floatingTabElement = floatingTabElement;

  updatePlaceholderPosition(startClientX);

  floatingTabElement.style.left = `${startClientX - pointerOffsetX}px`;
  floatingTabElement.style.top = `${startClientY - pointerOffsetY}px`;
}

function startTabPointerDrag(event, tabElement, tab) {
  event.preventDefault();

  const startClientX = event.clientX;
  const startClientY = event.clientY;
  const rect = tabElement.getBoundingClientRect();

  if (tabElement.setPointerCapture) {
    tabElement.setPointerCapture(event.pointerId);
  }

  const handlePointerMove = (moveEvent) => {
    if (!tabDragState) return;

    const deltaX = moveEvent.clientX - startClientX;
    const deltaY = moveEvent.clientY - startClientY;

    if (!tabDragState.active) {
      if (Math.abs(deltaX) < 4 && Math.abs(deltaY) < 4) return;
      activateTabPointerDrag();
    }

    tabDragState.floatingTabElement.style.left = `${moveEvent.clientX - tabDragState.pointerOffsetX}px`;
    tabDragState.floatingTabElement.style.top = `${moveEvent.clientY - tabDragState.pointerOffsetY}px`;

    const isOutsideTabsArea = !isPointerInsideTabsArea(moveEvent.clientX, moveEvent.clientY);

    if (isOutsideTabsArea) {
      if (!tabDragState.isOutsideTabsArea) {
        tabDragState.isOutsideTabsArea = true;
        showDetachedTabGhost(moveEvent, tab);
      } else {
        moveDetachedTabGhost(moveEvent);
      }
      return;
    }

    if (tabDragState.isOutsideTabsArea) {
      tabDragState.isOutsideTabsArea = false;
      hideDetachedTabGhost();
    }

    updatePlaceholderPosition(moveEvent.clientX);
  };

  const handlePointerUp = (upEvent) => {
    const shouldDetach = tabDragState?.active && !isPointerInsideTabsArea(upEvent.clientX, upEvent.clientY);
    finishTabPointerDrag(true, shouldDetach);
  };

  const handlePointerCancel = () => {
    finishTabPointerDrag(false, false);
  };

  tabDragState = {
    tabId: tab.id,
    draggedTabElement: tabElement,
    pointerOffsetX: event.clientX - rect.left,
    pointerOffsetY: event.clientY - rect.top,
    startClientX,
    startClientY,
    pointerId: event.pointerId,
    active: false,
    isOutsideTabsArea: false,
    floatingTabElement: null,
    placeholderElement: null,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel
  };

  document.addEventListener('pointermove', handlePointerMove);
  document.addEventListener('pointerup', handlePointerUp, { once: true });
  document.addEventListener('pointercancel', handlePointerCancel, { once: true });
}

// Manejar notificaciones desde el proceso principal
function handleMainProcessNotifications() {
  window.electronAPI.onNotification((data) => {
    showNotification(data.message, data.type);
  });
}

// Control de ventana (min, max, close)
function setupWindowControls() {
  const tabBar = document.getElementById('tab-bar');
  const minBtn = document.getElementById('window-min-btn');
  const maxBtn = document.getElementById('window-max-btn');
  const closeBtn = document.getElementById('window-close-btn');

  minBtn.addEventListener('click', () => {
    window.electronAPI && window.electronAPI.windowControl && window.electronAPI.windowControl('minimize');
  });

  maxBtn.addEventListener('click', () => {
    window.electronAPI && window.electronAPI.toggleMaximize && window.electronAPI.toggleMaximize();
  });

  closeBtn.addEventListener('click', () => {
    window.electronAPI && window.electronAPI.windowControl && window.electronAPI.windowControl('close');
  });

  tabsNavLeftBtn.addEventListener('click', () => {
    if (tabsNavLeftBtn.disabled) return;
    syncManagedVisibleWindow(managedVisibleStartIndex - 1, false);
    renderVisibleTabs();
  });

  tabsNavRightBtn.addEventListener('click', () => {
    if (tabsNavRightBtn.disabled) return;
    syncManagedVisibleWindow(managedVisibleStartIndex + 1, false);
    renderVisibleTabs();
  });

  tabBar.addEventListener('dblclick', (event) => {
    const interactiveSelector = 'button, .tab, .tab *';
    if (event.target.closest(interactiveSelector)) return;

    window.electronAPI && window.electronAPI.toggleMaximize && window.electronAPI.toggleMaximize();
  });
}

// Inicializar la aplicación
async function initApp() {
  const theme = await window.electronAPI.getTheme();

  // Configurar notificaciones desde el proceso principal
  handleMainProcessNotifications();

  // Iniciar tema
  applyTheme(theme);
  
  // Escuchar eventos de cambio de tema del sistema
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
    const theme = await window.electronAPI.getTheme();
    if (theme === 'system') {
      applyTheme('system');
    }
  });
  
  // Suscribirse a actualizaciones de pestañas
  window.electronAPI.onTabsUpdated((data) => {
    updateTabsUI(data);
  });

  // Apertura de modales flotantes
  settingsBtn.addEventListener('click', () => {
    hideTabInfoCard(true);
    window.electronAPI.toggleFloatingModal({ type: 'settings' });
  });

  window.addEventListener('resize', () => {
    syncManagedVisibleWindow();
    renderVisibleTabs();
    if (tabInfoState.visible) {
      refreshVisibleTabInfoCard();
    }
  });

  // Nueva pestaña
  newTabBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    hideTabInfoCard(true);

    const buttonRect = newTabBtn.getBoundingClientRect();
    window.electronAPI.toggleFloatingModal({
      type: 'launcher',
      payload: {
        anchorRect: {
          left: buttonRect.left,
          top: buttonRect.top,
          right: buttonRect.right,
          bottom: buttonRect.bottom,
          width: buttonRect.width,
          height: buttonRect.height
        }
      }
    });
  });

  window.electronAPI.onTabInfoHoverState(({ inside }) => {
    tabInfoState.pointerInsideCard = Boolean(inside);
    if (tabInfoState.pointerInsideCard) {
      cancelTabInfoCloseTimer();
    } else if (!tabInfoState.hoveredTabId) {
      scheduleTabInfoCardClose();
    }
  });

  window.electronAPI.onTabInfoFavoriteToggle(({ tabId, isFavorite }) => {
    if (!tabId) return;

    const targetTab = currentTabsData.find((tab) => tab.id === tabId);
    if (targetTab) {
      targetTab.isFavorite = Boolean(isFavorite);
    }

    if (isFavorite) {
      favoriteTabIds.add(tabId);
    } else {
      favoriteTabIds.delete(tabId);
    }

    if (tabInfoState.visible && tabInfoState.currentTabId === tabId) {
      refreshVisibleTabInfoCard();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && tabInfoState.visible) {
      hideTabInfoCard(true);
    }
  });
}

// Iniciar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupWindowControls();
});
