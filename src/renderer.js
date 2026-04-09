/**
 * Renderer principal para Microsoft 365 Copilot
 * Gestiona la interfaz de usuario y la interacción con el proceso principal.
 */

// Elementos del DOM
const tabsContainer = document.getElementById('tabs');
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
const notificationContainer = document.getElementById('notification-container');

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
  
  // Actualizar campos
  mainUrlInput.value = mainUrl;
  syncMainUrlPreset(mainUrl);
  userAgentInput.value = userAgent;
  themeSelect.value = theme;
  
  // Aplicar tema
  applyTheme(theme);
  
  return { mainUrl, userAgent, theme };
}

// Guardar configuración
async function saveSettings() {
  const mainUrl = mainUrlInput.value.trim();
  const userAgent = userAgentInput.value.trim();
  const theme = themeSelect.value;
  
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

// Crear elemento para una pestaña
function createTabElement(tab, isActive) {
  const tabElement = document.createElement('div');
  tabElement.className = 'tab';
  if (isActive) tabElement.classList.add('active');
  
  // Detectar si es una pestaña de Copilot
  const isCopilot = tab.url.includes('m365.cloud.microsoft') || 
                   tab.url.includes('copilot') || 
                   tab.title.toLowerCase().includes('copilot');
  
  if (isCopilot) {
    tabElement.classList.add('copilot');
  }
  
  // Crear ícono
  const tabIcon = document.createElement('div');
  tabIcon.className = 'tab-icon';
  
  // Obtener ruta del ícono basado en URL/título
  const iconPath = getTabIconPath(tab.url, tab.title);
  
  // Si tenemos un ícono en la carpeta icons, usarlo
  if (iconPath) {
    tabIcon.innerHTML = `<img src="${iconPath}" alt="" width="16" height="16">`;
  } else {
    // Fallback a ícono de Material Symbols
    const iconSymbol = getTabIconSymbol(tab.url, tab.title);
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
  tabActions.appendChild(closeBtn);
  
  tabElement.appendChild(tabIcon);
  tabElement.appendChild(tabTitle);
  tabElement.appendChild(tabActions);
  
  // Al hacer clic, cambia a esa pestaña
  tabElement.addEventListener('click', () => {
    window.electronAPI.switchTab(tab.id);
  });
  
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

  // Priorizar detección por título y extensión del archivo
  const isWordFile = hasFileExtension('.doc') || hasFileExtension('.docx') ||
    hasOfficePattern(['word', 'document', 'word-edit', 'word-view', 'word-online', '/:w:/', 'app=word']) ||
    (lowerUrl.includes('/_layouts/15/wopiframe.aspx') && lowerUrl.includes('doc'));

  const isExcelFile = hasFileExtension('.xls') || hasFileExtension('.xlsx') || hasFileExtension('.xlsm') ||
    hasOfficePattern(['excel', 'spreadsheet', 'workbook', 'excel-edit', 'excel-view', 'excel-online', '/:x:/', 'app=excel', 'xlviewer.aspx']) ||
    (lowerUrl.includes('/_layouts/15/wopiframe.aspx') && lowerUrl.includes('xls'));

  const isPowerPointFile = hasFileExtension('.ppt') || hasFileExtension('.pptx') ||
    hasOfficePattern(['powerpoint', 'presentation', 'powerpoint-edit', 'powerpoint-view', 'powerpoint-online', '/:p:/', 'app=powerpoint']) ||
    (lowerUrl.includes('/_layouts/15/wopiframe.aspx') && lowerUrl.includes('ppt'));

  const isOneNoteFile = hasFileExtension('.one') ||
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
  // Limpiar contenedor
  tabsContainer.innerHTML = '';
  
  // Renderizar cada pestaña
  data.tabs.forEach(tab => {
    const isActive = tab.id === data.activeTabId;
    const tabElement = createTabElement(tab, isActive);
    tabsContainer.appendChild(tabElement);
  });
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
    await openSettingsModal();
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
  
  // Cerrar modal al hacer clic fuera
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      closeSettingsModal();
    }
  });
  
  appLauncherOverlay.addEventListener('click', (event) => {
    if (event.target === appLauncherOverlay) {
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
