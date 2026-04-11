function createFloatingModalController({
  BrowserWindow,
  getMainWindow,
  preloadPath,
  modalHtmlPath,
  tabInfoModalWidth = 340,
  tabInfoModalHeight = 248,
  tabInfoModalMargin = 12
}) {
  let floatingModalWindow = null;
  let floatingModalState = null;
  let floatingModalLoaded = false;

  function getWindowBounds(type = floatingModalState?.type, payload = floatingModalState?.payload || {}) {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return null;

    const mainBounds = mainWindow.getBounds();

    if (type === 'tab-info') {
      const anchorRect = payload.anchorRect || {};
      const width = tabInfoModalWidth;
      const height = tabInfoModalHeight;
      const left = Number(anchorRect.left) || tabInfoModalMargin;
      const bottom = Number(anchorRect.bottom) || 0;
      const anchorWidth = Number(anchorRect.width) || 0;

      const maxLeft = Math.max(tabInfoModalMargin, mainBounds.width - width - tabInfoModalMargin);
      const x = mainBounds.x + Math.round(
        Math.min(
          Math.max(left + (anchorWidth / 2) - (width / 2), tabInfoModalMargin),
          maxLeft
        )
      );
      const maxTop = Math.max(tabInfoModalMargin, mainBounds.height - height - tabInfoModalMargin);
      const y = mainBounds.y + Math.round(
        Math.min(
          Math.max(bottom + 10, tabInfoModalMargin),
          maxTop
        )
      );

      return { x, y, width, height };
    }

    return mainBounds;
  }

  function buildState(type, payload = {}) {
    return {
      type,
      payload,
      windowBounds: getWindowBounds(type, payload)
    };
  }

  function sendState() {
    if (!floatingModalWindow || floatingModalWindow.isDestroyed() || !floatingModalLoaded || !floatingModalState) return;
    floatingModalWindow.webContents.send('floating-modal-state', floatingModalState);
  }

  function syncBounds() {
    if (!floatingModalWindow || floatingModalWindow.isDestroyed()) return;
    const bounds = getWindowBounds();
    if (!bounds) return;
    floatingModalWindow.setBounds(bounds, false);
  }

  function ensureWindow() {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return null;

    if (floatingModalWindow && !floatingModalWindow.isDestroyed()) {
      syncBounds();
      return floatingModalWindow;
    }

    const bounds = getWindowBounds();
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
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false
      }
    });

    floatingModalWindow.setMenuBarVisibility(false);
    floatingModalWindow.loadFile(modalHtmlPath);

    floatingModalWindow.once('ready-to-show', () => {
      syncBounds();
      sendState();
      floatingModalWindow.show();
      floatingModalWindow.focus();
    });

    floatingModalWindow.webContents.on('did-finish-load', () => {
      floatingModalLoaded = true;
      sendState();
    });

    floatingModalWindow.on('closed', () => {
      floatingModalWindow = null;
      floatingModalLoaded = false;
      floatingModalState = null;
    });

    return floatingModalWindow;
  }

  function open(type, payload = {}) {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;

    floatingModalState = buildState(type, payload);
    const modalWindow = ensureWindow();
    if (!modalWindow) return;

    syncBounds();

    if (floatingModalLoaded) {
      sendState();
      modalWindow.show();
      modalWindow.focus();
    }
  }

  function close() {
    floatingModalState = null;
    if (!floatingModalWindow || floatingModalWindow.isDestroyed()) return;
    floatingModalWindow.hide();
  }

  function toggle(config = {}) {
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
      close();
      return;
    }

    open(type, payload);
  }

  function destroy() {
    close();
    if (!floatingModalWindow || floatingModalWindow.isDestroyed()) return;
    floatingModalWindow.close();
  }

  function getState() {
    return floatingModalState;
  }

  return {
    close,
    destroy,
    getState,
    open,
    sendState,
    syncBounds,
    toggle
  };
}

module.exports = {
  createFloatingModalController
};
