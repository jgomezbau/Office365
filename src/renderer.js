/**
 * Renderer principal para Microsoft 365 Copilot
 * Gestiona la interfaz de usuario y la interacción con el proceso principal.
 */

// Elementos del DOM
const tabsContainer = document.getElementById('tabs');
const newTabBtn = document.getElementById('new-tab-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal-overlay');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const settingsCancelBtn = document.getElementById('settings-cancel-btn');
const settingsSaveBtn = document.getElementById('settings-save-btn');
const mainUrlInput = document.getElementById('main-url');
const userAgentInput = document.getElementById('user-agent');
const themeSelect = document.getElementById('theme-select');
const notificationContainer = document.getElementById('notification-container');

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

// Cargar y aplicar la configuración
async function loadSettings() {
  // Obtener configuración
  const mainUrl = await window.electronAPI.getMainUrl();
  const userAgent = await window.electronAPI.getUserAgent();
  const theme = await window.electronAPI.getTheme();
  
  // Actualizar campos
  mainUrlInput.value = mainUrl;
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
  const lowerUrl = url.toLowerCase();
  const lowerTitle = (title || '').toLowerCase();
  
  // Microsoft Word
  if (lowerUrl.includes('word') || lowerTitle.includes('word') || 
      lowerUrl.includes('.doc') || lowerUrl.includes('/document')) {
    return '../icons/word.png';
  } 
  // Microsoft Excel
  else if (lowerUrl.includes('excel') || lowerTitle.includes('excel') || 
           lowerUrl.includes('.xls') || lowerUrl.includes('/spreadsheet')) {
    return '../icons/excel.png';
  } 
  // Microsoft PowerPoint
  else if (lowerUrl.includes('powerpoint') || lowerTitle.includes('powerpoint') || 
           lowerUrl.includes('.ppt') || lowerUrl.includes('/presentation')) {
    return '../icons/powerpoint.png';
  } 
  // Microsoft Outlook
  else if (lowerUrl.includes('outlook') || lowerTitle.includes('outlook') || 
           lowerUrl.includes('/mail') || lowerTitle.includes('correo')) {
    return '../icons/outlook.png';
  } 
  // Microsoft Teams
  else if (lowerUrl.includes('teams') || lowerTitle.includes('teams') || 
           lowerTitle.includes('equipo')) {
    return '../icons/teams.png';
  } 
  // Microsoft OneDrive
  else if (lowerUrl.includes('onedrive') || lowerTitle.includes('onedrive') || 
           lowerUrl.includes('/files') || lowerUrl.includes('/personal')) {
    return '../icons/onedrive.png';
  } 
  // Microsoft OneNote
  else if (lowerUrl.includes('onenote') || lowerTitle.includes('onenote') || 
           lowerTitle.includes('bloc de notas')) {
    return '../icons/onenote.png';
  } 
  // Microsoft SharePoint
  else if (lowerUrl.includes('sharepoint') || lowerTitle.includes('sharepoint') || 
           lowerUrl.includes('/sites/') || lowerTitle.includes('sitio')) {
    return '../icons/icon.png'; // Usando el ícono principal como sustituto para SharePoint
  } 
  // Centro de administración
  else if (lowerUrl.includes('admin') || lowerTitle.includes('admin') || 
           lowerTitle.includes('administra') || lowerUrl.includes('/adminportal/') ||
           lowerUrl.includes('/admincenter/')) {
    return '../icons/icon.png'; // Usando el ícono principal para el Centro de Administración
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

// Inicializar la aplicación
async function initApp() {
  // Cargar configuración
  const settings = await loadSettings();
  
  // Configurar notificaciones desde el proceso principal
  handleMainProcessNotifications();
  
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
  settingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('visible');
  });
  
  settingsCloseBtn.addEventListener('click', () => {
    settingsModal.classList.remove('visible');
  });
  
  settingsCancelBtn.addEventListener('click', () => {
    loadSettings(); // Restaurar valores
    settingsModal.classList.remove('visible');
  });
  
  settingsSaveBtn.addEventListener('click', async () => {
    const success = await saveSettings();
    if (success) {
      showNotification('Configuración guardada correctamente');
      settingsModal.classList.remove('visible');
    }
  });
  
  // Cerrar modal al hacer clic fuera
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.remove('visible');
    }
  });
  
  // Nueva pestaña
  newTabBtn.addEventListener('click', async () => {
    const mainUrl = await window.electronAPI.getMainUrl();
    window.electronAPI.createTab(mainUrl);
  });
}

// Iniciar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initApp);