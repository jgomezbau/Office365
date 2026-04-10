/**
 * Renderer principal para Microsoft 365 Copilot
 * Gestiona la interfaz de usuario y la interacción con el proceso principal.
 */

// Elementos del DOM
const tabsContainer = document.getElementById('tabs');
const tabsArea = document.getElementById('tabs-area');
const newTabBtn = document.getElementById('new-tab-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal-overlay');
const settingsBackdrop = document.getElementById('settings-backdrop');
const appLauncherOverlay = document.getElementById('app-launcher-overlay');
const appLauncherBackdrop = document.getElementById('app-launcher-backdrop');
const appLauncherPanel = document.getElementById('app-launcher-panel');
const appLauncherGrid = document.getElementById('app-launcher-grid');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const settingsCancelBtn = document.getElementById('settings-cancel-btn');
const settingsSaveBtn = document.getElementById('settings-save-btn');
const mainUrlPresetSelect = document.getElementById('main-url-preset');
const mainUrlInput = document.getElementById('main-url');
const userAgentInput = document.getElementById('user-agent');
const themeSelect = document.getElementById('theme-select');
const reopenTabsOnLaunchInput = document.getElementById('reopen-tabs-on-launch');
const notificationContainer = document.getElementById('notification-container');
let currentTabsData = [];
let currentActiveTabId = null;
let tabDragState = null;
let suppressClickTabId = null;

const MAIN_URL_PRESETS = {
  corporate: 'https://www.microsoft365.com/?auth=2',
  personal: 'https://www.microsoft365.com/?auth=1'
};

const OUTLOOK_URLS = {
  corporate: 'https://outlook.office.com/mail/',
  personal: 'https://outlook.live.com/mail/'
};

const APP_LAUNCHER_ITEMS = [
  {
    id: 'word',
    label: 'Word',
    icon: '../icons/word.png',
    url: 'https://www.microsoft365.com/launch/word'
  },
  {
    id: 'excel',
    label: 'Excel',
    icon: '../icons/excel.png',
    url: 'https://www.microsoft365.com/launch/excel'
  },
  {
    id: 'powerpoint',
    label: 'PowerPoint',
    icon: '../icons/powerpoint.png',
    url: 'https://www.microsoft365.com/launch/powerpoint'
  },
  {
    id: 'onedrive',
    label: 'OneDrive',
    icon: '../icons/onedrive.png',
    url: 'https://www.microsoft365.com/launch/onedrive'
  },
  {
    id: 'outlook',
    label: 'Outlook',
    icon: '../icons/outlook.png',
    url: OUTLOOK_URLS.corporate
  },
  {
    id: 'teams',
    label: 'Teams',
    icon: '../icons/teams.png',
    url: 'https://teams.live.com/v2/?utm_source=OfficeWeb'
  },
  {
    id: 'onenote',
    label: 'OneNote',
    icon: '../icons/onenote.png',
    url: 'https://www.onenote.com/notebooks'
  }
];

// Detectar tema del sistema y aplicarlo
function applyTheme(theme) {
  if (theme === 'system') {
    // Detectar preferencia del sistema
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

function getMainUrlPresetValue(url) {
  const normalizedUrl = (url || '').trim();

  if (normalizedUrl === MAIN_URL_PRESETS.corporate) return 'corporate';
  if (normalizedUrl === MAIN_URL_PRESETS.personal) return 'personal';
  return 'custom';
}

function syncMainUrlPreset(url) {
  mainUrlPresetSelect.value = getMainUrlPresetValue(url);
}

function getAccountModeFromMainUrl(url) {
  const normalizedUrl = (url || '').trim().toLowerCase();

  if (!normalizedUrl) return 'corporate';
  if (normalizedUrl === MAIN_URL_PRESETS.personal) return 'personal';
  if (normalizedUrl === MAIN_URL_PRESETS.corporate) return 'corporate';
  if (normalizedUrl.includes('auth=1')) return 'personal';
  if (normalizedUrl.includes('auth=2')) return 'corporate';
  if (normalizedUrl.includes('outlook.live.com') || normalizedUrl.includes('office.live.com')) return 'personal';
  if (normalizedUrl.includes('outlook.office.com')) return 'corporate';

  return 'corporate';
}

function getLauncherUrl(item) {
  if (item.id !== 'outlook') {
    return item.url;
  }

  const presetMode = mainUrlPresetSelect.value;
  const configuredMode = presetMode === 'custom'
    ? getAccountModeFromMainUrl(mainUrlInput.value)
    : presetMode;

  return OUTLOOK_URLS[configuredMode] || OUTLOOK_URLS.corporate;
}

// Cargar y aplicar la configuración
async function loadSettings() {
  // Obtener configuración
  const mainUrl = await window.electronAPI.getMainUrl();
  const userAgent = await window.electronAPI.getUserAgent();
  const theme = await window.electronAPI.getTheme();
  const reopenTabsOnLaunch = await window.electronAPI.getReopenTabsOnLaunch();
  
  // Actualizar campos
  mainUrlInput.value = mainUrl;
  syncMainUrlPreset(mainUrl);
  userAgentInput.value = userAgent;
  themeSelect.value = theme;
  reopenTabsOnLaunchInput.checked = reopenTabsOnLaunch;
  
  // Aplicar tema
  applyTheme(theme);
  
  return { mainUrl, userAgent, theme, reopenTabsOnLaunch };
}

// Guardar configuración
async function saveSettings() {
  const mainUrl = mainUrlInput.value.trim();
  const userAgent = userAgentInput.value.trim();
  const theme = themeSelect.value;
  const reopenTabsOnLaunch = reopenTabsOnLaunchInput.checked;
  
  if (!mainUrl) {
    showNotification('Debe ingresar una URL principal válida', 'error');
    return false;
  }
  
  try {
    // Validar URL
    new URL(mainUrl);
    
    // Guardar cambios
    await window.electronAPI.setMainUrl(mainUrl);
    await window.electronAPI.setUserAgent(userAgent);
    await window.electronAPI.setTheme(theme);
    await window.electronAPI.setReopenTabsOnLaunch(reopenTabsOnLaunch);
    
    // Aplicar tema 
    applyTheme(theme);
    
    return true;
  } catch (error) {
    showNotification('URL inválida. Ingrese una URL completa incluyendo https://', 'error');
    return false;
  }
}

// Mostrar notificación
function showNotification(message, type = 'success') {
  // Crear elemento de notificación
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  
  // Contenido
  const content = document.createElement('div');
  content.className = 'notification-content';
  content.textContent = message;
  
  // Botón de cierre
  const closeBtn = document.createElement('div');
  closeBtn.className = 'notification-close';
  closeBtn.innerHTML = '<span class="material-symbols-rounded">close</span>';
  closeBtn.addEventListener('click', () => {
    notification.classList.remove('visible');
    setTimeout(() => notification.remove(), 300);
  });
  
  notification.appendChild(content);
  notification.appendChild(closeBtn);
  
  // Añadir al contenedor
  notificationContainer.appendChild(notification);
  
  // Mostrar con animación
  setTimeout(() => notification.classList.add('visible'), 10);
  
  // Auto-ocultar después de 5 segundos
  setTimeout(() => {
    if (document.body.contains(notification)) {
      notification.classList.remove('visible');
      setTimeout(() => notification.remove(), 300);
    }
  }, 5000);
}

function renderAppLauncher() {
  appLauncherGrid.innerHTML = '';

  APP_LAUNCHER_ITEMS.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'app-launcher-item';
    button.title = `Abrir ${item.label} en una pestaña nueva`;
    button.innerHTML = `
      <span class="app-launcher-icon-wrap">
        <img src="${item.icon}" alt="" width="34" height="34">
      </span>
      <span class="app-launcher-label">${item.label}</span>
    `;

    button.addEventListener('click', () => {
      closeAppLauncher();
      window.electronAPI.createTab({
        url: getLauncherUrl(item),
        partition: item.partition,
        appId: item.appId
      });
    });

    appLauncherGrid.appendChild(button);
  });
}

function positionAppLauncher() {
  const buttonRect = newTabBtn.getBoundingClientRect();
  const tabBarRect = document.getElementById('tab-bar').getBoundingClientRect();
  const launcherWidth = Math.min(360, window.innerWidth - 32);
  const preferredLeft = buttonRect.left - 24;
  const maxLeft = Math.max(16, window.innerWidth - launcherWidth - 16);
  const left = Math.min(Math.max(16, preferredLeft), maxLeft);
  const top = Math.max(buttonRect.bottom - tabBarRect.bottom + 10, 10);

  appLauncherPanel.style.left = `${left}px`;
  appLauncherPanel.style.top = `${top}px`;
}

function closeAppLauncher() {
  if (!appLauncherOverlay.classList.contains('visible')) return;

  appLauncherOverlay.classList.remove('visible');
  appLauncherBackdrop.style.backgroundImage = '';
  window.electronAPI.toggleSettingsOverlay(false);
}

function closeSettingsModal() {
  if (!settingsModal.classList.contains('visible')) return;

  settingsModal.classList.remove('visible');
  settingsBackdrop.style.backgroundImage = '';
  window.electronAPI.toggleSettingsOverlay(false);
}

async function openSettingsModal() {
  closeAppLauncher();
  const previewDataUrl = await window.electronAPI.captureActiveTabPreview();
  if (previewDataUrl) {
    settingsBackdrop.style.backgroundImage = `url("${previewDataUrl}")`;
  } else {
    settingsBackdrop.style.backgroundImage = '';
  }

  settingsModal.classList.add('visible');
  window.electronAPI.toggleSettingsOverlay(true);
}

async function openAppLauncher() {
  settingsModal.classList.remove('visible');
  const previewDataUrl = await window.electronAPI.captureActiveTabPreview();
  if (previewDataUrl) {
    appLauncherBackdrop.style.backgroundImage = `url("${previewDataUrl}")`;
  } else {
    appLauncherBackdrop.style.backgroundImage = '';
  }
  positionAppLauncher();
  appLauncherOverlay.classList.add('visible');
  window.electronAPI.toggleSettingsOverlay(true);
}

async function toggleAppLauncher() {
  if (appLauncherOverlay.classList.contains('visible')) {
    closeAppLauncher();
  } else {
    await openAppLauncher();
  }
}

async function toggleSettingsModal() {
  if (settingsModal.classList.contains('visible')) {
    closeSettingsModal();
  } else {
    await openSettingsModal();
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
  tabTitle.textContent = tab.title || tab.url;
  
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

  if (!tab.isPrimary) {
    tabElement.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('.tab-actions')) return;
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
    return;
  }

  currentTabsData = data.tabs;
  currentActiveTabId = data.activeTabId;

  // Limpiar contenedor
  tabsContainer.innerHTML = '';
  
  // Renderizar cada pestaña
  data.tabs.forEach((tab, index) => {
    const isActive = tab.id === data.activeTabId;
    const tabElement = createTabElement(tab, isActive, index);
    tabsContainer.appendChild(tabElement);
  });
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
  return Array.from(tabsContainer.querySelectorAll('.tab'))
    .map((element) => {
      if (placeholderElement && element === placeholderElement) {
        return draggedTabElement;
      }
      return element;
    })
    .filter(Boolean)
    .map((element) => Number(element.dataset.tabId));
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

function finishTabPointerDrag(commitReorder, detachToWindow = false) {
  if (!tabDragState) return;

  const {
    active,
    tabId,
    draggedTabElement,
    floatingTabElement,
    placeholderElement,
    handlePointerMove,
    handlePointerUp
  } = tabDragState;

  document.removeEventListener('pointermove', handlePointerMove);
  document.removeEventListener('pointerup', handlePointerUp);
  document.body.classList.remove('tab-drag-active');
  tabsContainer.classList.remove('drop-at-end');
  newTabBtn.classList.remove('drop-at-end');

  if (active) {
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
    updatePlaceholderPosition(moveEvent.clientX);
  };

  const handlePointerUp = (upEvent) => {
    const shouldDetach = tabDragState?.active && !isPointerInsideTabsArea(upEvent.clientX, upEvent.clientY);
    finishTabPointerDrag(true, shouldDetach);
  };

  tabDragState = {
    tabId: tab.id,
    draggedTabElement: tabElement,
    pointerOffsetX: event.clientX - rect.left,
    pointerOffsetY: event.clientY - rect.top,
    startClientX,
    startClientY,
    active: false,
    floatingTabElement: null,
    placeholderElement: null,
    handlePointerMove,
    handlePointerUp
  };

  document.addEventListener('pointermove', handlePointerMove);
  document.addEventListener('pointerup', handlePointerUp, { once: true });
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

  tabBar.addEventListener('dblclick', (event) => {
    const interactiveSelector = 'button, .tab, .tab *';
    if (event.target.closest(interactiveSelector)) return;

    window.electronAPI && window.electronAPI.toggleMaximize && window.electronAPI.toggleMaximize();
  });
}

// Inicializar la aplicación
async function initApp() {
  // Cargar configuración
  const settings = await loadSettings();
  
  // Configurar notificaciones desde el proceso principal
  handleMainProcessNotifications();
  renderAppLauncher();
  
  // Iniciar tema
  applyTheme(settings.theme);
  
  // Escuchar eventos de cambio de tema del sistema
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (themeSelect.value === 'system') {
      applyTheme('system');
    }
  });
  
  // Suscribirse a actualizaciones de pestañas
  window.electronAPI.onTabsUpdated((data) => {
    updateTabsUI(data);
  });

  // Eventos para modal de configuración
  settingsBtn.addEventListener('click', async () => {
    await toggleSettingsModal();
  });

  mainUrlPresetSelect.addEventListener('change', () => {
    const selectedPreset = mainUrlPresetSelect.value;
    if (selectedPreset === 'custom') return;

    mainUrlInput.value = MAIN_URL_PRESETS[selectedPreset];
  });

  mainUrlInput.addEventListener('input', () => {
    syncMainUrlPreset(mainUrlInput.value);
  });
  
  settingsCloseBtn.addEventListener('click', () => {
    closeSettingsModal();
  });
  
  settingsCancelBtn.addEventListener('click', () => {
    loadSettings(); // Restaurar valores
    closeSettingsModal();
  });
  
  settingsSaveBtn.addEventListener('click', async () => {
    const success = await saveSettings();
    if (success) {
      showNotification('Configuración guardada correctamente');
      const mainUrl = mainUrlInput.value.trim();
      window.electronAPI.openUrlInActiveTab(mainUrl);
      closeSettingsModal();
    }
  });
  
  // Cerrar paneles al hacer clic fuera del contenido
  settingsModal.addEventListener('click', (event) => {
    if (!event.target.closest('.settings-modal')) {
      closeSettingsModal();
    }
  });
  
  appLauncherOverlay.addEventListener('click', (event) => {
    if (!event.target.closest('#app-launcher-panel')) {
      closeAppLauncher();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (appLauncherOverlay.classList.contains('visible')) {
        closeAppLauncher();
      }

      if (settingsModal.classList.contains('visible')) {
        closeSettingsModal();
      }
    }
  });

  window.addEventListener('resize', () => {
    if (appLauncherOverlay.classList.contains('visible')) {
      positionAppLauncher();
    }
  });

  // Nueva pestaña
  newTabBtn.addEventListener('click', async (event) => {
    event.stopPropagation();
    await toggleAppLauncher();
  });
}

// Iniciar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupWindowControls();
});
