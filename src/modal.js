const settingsModal = document.getElementById('settings-modal-overlay');
const appLauncherOverlay = document.getElementById('app-launcher-overlay');
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
const tabInfoCard = document.getElementById('tab-info-card-modal');
const tabInfoCardIcon = document.getElementById('tab-info-card-icon');
const tabInfoCardTitle = document.getElementById('tab-info-card-title');
const tabInfoCardService = document.getElementById('tab-info-card-service');
const tabInfoCardLocationIcon = document.getElementById('tab-info-card-location-icon');
const tabInfoCardLocation = document.getElementById('tab-info-card-location');
const tabInfoCardLastSaved = document.getElementById('tab-info-card-last-saved');
const tabInfoCardFavoriteBtn = document.getElementById('tab-info-card-favorite');
const tabInfoCardFavoriteIcon = document.getElementById('tab-info-card-favorite-icon');
const tabInfoCardDetachBtn = document.getElementById('tab-info-card-detach');

let currentModalState = null;

const MAIN_URL_PRESETS = {
  corporate: 'https://www.microsoft365.com/?auth=2',
  personal: 'https://www.microsoft365.com/?auth=1'
};

const OUTLOOK_URLS = {
  corporate: 'https://outlook.office.com/mail/',
  personal: 'https://outlook.live.com/mail/'
};

const APP_LAUNCHER_ITEMS = [
  { id: 'word', label: 'Word', icon: '../icons/word.png', url: 'https://www.microsoft365.com/launch/word' },
  { id: 'excel', label: 'Excel', icon: '../icons/excel.png', url: 'https://www.microsoft365.com/launch/excel' },
  { id: 'powerpoint', label: 'PowerPoint', icon: '../icons/powerpoint.png', url: 'https://www.microsoft365.com/launch/powerpoint' },
  { id: 'onedrive', label: 'OneDrive', icon: '../icons/onedrive.png', url: 'https://www.microsoft365.com/launch/onedrive' },
  { id: 'outlook', label: 'Outlook', icon: '../icons/outlook.png', url: OUTLOOK_URLS.corporate },
  { id: 'teams', label: 'Teams', icon: '../icons/teams.png', url: 'https://teams.live.com/v2/?utm_source=OfficeWeb' },
  { id: 'onenote', label: 'OneNote', icon: '../icons/onenote.png', url: 'https://www.onenote.com/notebooks' }
];

function applyTheme(theme) {
  if (theme === 'system') {
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
  if (item.id !== 'outlook') return item.url;

  const presetMode = mainUrlPresetSelect.value;
  const configuredMode = presetMode === 'custom'
    ? getAccountModeFromMainUrl(mainUrlInput.value)
    : presetMode;

  return OUTLOOK_URLS[configuredMode] || OUTLOOK_URLS.corporate;
}

async function loadSettings() {
  const mainUrl = await window.modalAPI.getMainUrl();
  const userAgent = await window.modalAPI.getUserAgent();
  const theme = await window.modalAPI.getTheme();
  const reopenTabsOnLaunch = await window.modalAPI.getReopenTabsOnLaunch();

  mainUrlInput.value = mainUrl;
  syncMainUrlPreset(mainUrl);
  userAgentInput.value = userAgent;
  themeSelect.value = theme;
  reopenTabsOnLaunchInput.checked = reopenTabsOnLaunch;
  applyTheme(theme);

  return { mainUrl, userAgent, theme, reopenTabsOnLaunch };
}

async function saveSettings() {
  const mainUrl = mainUrlInput.value.trim();
  const userAgent = userAgentInput.value.trim();
  const theme = themeSelect.value;
  const reopenTabsOnLaunch = reopenTabsOnLaunchInput.checked;

  if (!mainUrl) {
    window.modalAPI.notify('Debe ingresar una URL principal válida', 'error');
    return false;
  }

  try {
    new URL(mainUrl);
    await window.modalAPI.setMainUrl(mainUrl);
    await window.modalAPI.setUserAgent(userAgent);
    await window.modalAPI.setTheme(theme);
    await window.modalAPI.setReopenTabsOnLaunch(reopenTabsOnLaunch);
    applyTheme(theme);
    return true;
  } catch (error) {
    window.modalAPI.notify('URL inválida. Ingrese una URL completa incluyendo https://', 'error');
    return false;
  }
}

function closeModal() {
  window.modalAPI.close();
}

function positionAppLauncher(anchorRect = null) {
  const fallbackRight = 112;
  const launcherWidth = Math.min(360, window.innerWidth - 32);

  if (!anchorRect) {
    appLauncherPanel.style.left = `${Math.max(16, window.innerWidth - launcherWidth - fallbackRight)}px`;
    appLauncherPanel.style.top = '42px';
    return;
  }

  const preferredLeft = anchorRect.left - 24;
  const maxLeft = Math.max(16, window.innerWidth - launcherWidth - 16);
  const left = Math.min(Math.max(16, preferredLeft), maxLeft);
  const top = Math.max(anchorRect.bottom + 10, 10);

  appLauncherPanel.style.left = `${left}px`;
  appLauncherPanel.style.top = `${top}px`;
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
      window.modalAPI.createTab({
        url: getLauncherUrl(item),
        partition: item.partition,
        appId: item.appId
      });
      closeModal();
    });

    appLauncherGrid.appendChild(button);
  });
}

function hideAllOverlays() {
  settingsModal.classList.remove('visible');
  appLauncherOverlay.classList.remove('visible');
  tabInfoCard.classList.remove('visible');
  tabInfoCard.setAttribute('aria-hidden', 'true');
}

function renderTabInfoIcon(payload) {
  if (payload.iconPath) {
    tabInfoCardIcon.innerHTML = `<img src="${payload.iconPath}" alt="" width="22" height="22">`;
    return;
  }

  const iconSymbol = payload.iconSymbol || 'description';
  tabInfoCardIcon.innerHTML = `<span class="material-symbols-rounded">${iconSymbol}</span>`;
}

function renderTabInfo(payload = {}) {
  renderTabInfoIcon(payload);
  tabInfoCardTitle.textContent = payload.title || 'Sin título';
  tabInfoCardTitle.title = payload.title || 'Sin título';
  tabInfoCardService.textContent = payload.service || 'Cloud';
  tabInfoCardLocationIcon.textContent = payload.locationIcon || 'cloud';
  tabInfoCardLocation.textContent = payload.locationText || 'No disponible';
  tabInfoCardLocation.title = payload.locationText || 'No disponible';
  tabInfoCardLastSaved.textContent = payload.lastSaved || 'No disponible';
  tabInfoCardFavoriteBtn.classList.toggle('is-active', Boolean(payload.isFavorite));
  tabInfoCardFavoriteBtn.setAttribute('aria-pressed', payload.isFavorite ? 'true' : 'false');
  tabInfoCardFavoriteIcon.textContent = 'star';
  tabInfoCardDetachBtn.disabled = Boolean(payload.isPrimary);
  tabInfoCard.dataset.tabId = payload.tabId || '';
  tabInfoCard.classList.add('visible');
  tabInfoCard.setAttribute('aria-hidden', 'false');
}

async function renderModal(state) {
  currentModalState = state;
  hideAllOverlays();

  if (!state || !state.type) return;

  if (state.type !== 'tab-info') {
    await loadSettings();
  }

  if (state.type === 'settings') {
    settingsModal.classList.add('visible');
    return;
  }

  if (state.type === 'launcher') {
    renderAppLauncher();
    positionAppLauncher(state.payload?.anchorRect || null);
    appLauncherOverlay.classList.add('visible');
    return;
  }

  if (state.type === 'tab-info') {
    renderTabInfo(state.payload || {});
  }
}

function setupEvents() {
  mainUrlPresetSelect.addEventListener('change', () => {
    const selectedPreset = mainUrlPresetSelect.value;
    if (selectedPreset === 'custom') return;
    mainUrlInput.value = MAIN_URL_PRESETS[selectedPreset];
  });

  mainUrlInput.addEventListener('input', () => {
    syncMainUrlPreset(mainUrlInput.value);
  });

  settingsCloseBtn.addEventListener('click', closeModal);
  settingsCancelBtn.addEventListener('click', async () => {
    await loadSettings();
    closeModal();
  });

  settingsSaveBtn.addEventListener('click', async () => {
    const success = await saveSettings();
    if (!success) return;

    window.modalAPI.notify('Configuración guardada correctamente', 'success');
    await window.modalAPI.openUrlInActiveTab(mainUrlInput.value.trim());
    closeModal();
  });

  settingsModal.addEventListener('click', (event) => {
    if (!event.target.closest('.settings-modal')) {
      closeModal();
    }
  });

  appLauncherOverlay.addEventListener('click', (event) => {
    if (!event.target.closest('#app-launcher-panel')) {
      closeModal();
    }
  });

  tabInfoCard.addEventListener('mouseenter', () => {
    window.modalAPI.tabInfoHover(true);
  });

  tabInfoCard.addEventListener('mouseleave', () => {
    window.modalAPI.tabInfoHover(false);
  });

  tabInfoCardFavoriteBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const tabId = Number(tabInfoCard.dataset.tabId || 0);
    if (!tabId) return;
    window.modalAPI.toggleTabInfoFavorite(tabId);
  });

  tabInfoCardDetachBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const tabId = Number(tabInfoCard.dataset.tabId || 0);
    if (!tabId) return;
    window.modalAPI.detachTabToWindow(tabId);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeModal();
    }
  });

  window.addEventListener('resize', () => {
    if (currentModalState?.type === 'launcher') {
      positionAppLauncher(currentModalState.payload?.anchorRect || null);
    }
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
    const theme = await window.modalAPI.getTheme();
    if (theme === 'system') {
      applyTheme('system');
    }
  });
}

async function init() {
  setupEvents();
  window.modalAPI.onState((state) => {
    renderModal(state).catch(console.error);
  });
  const initialState = await window.modalAPI.getState();
  await renderModal(initialState);
}

window.addEventListener('DOMContentLoaded', () => {
  init().catch(console.error);
});
