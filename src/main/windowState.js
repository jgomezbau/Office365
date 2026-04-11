function areBoundsVisible(screen, bounds) {
  if (!bounds) return false;

  const displays = screen.getAllDisplays();
  return displays.some(({ workArea }) => {
    const overlapWidth = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x);
    const overlapHeight = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y);
    return overlapWidth >= 120 && overlapHeight >= 120;
  });
}

function createMainWindowStateManager({
  configManager,
  screen,
  getMainWindow,
  minWidth = 900,
  minHeight = 650,
  defaultWidth = 1200,
  defaultHeight = 800
}) {
  let saveWindowStateTimeout = null;

  function getValidatedWindowBounds() {
    const savedBounds = configManager.getWindowBounds();
    if (
      savedBounds &&
      Number.isFinite(savedBounds.x) &&
      Number.isFinite(savedBounds.y) &&
      Number.isFinite(savedBounds.width) &&
      Number.isFinite(savedBounds.height) &&
      savedBounds.width >= minWidth &&
      savedBounds.height >= minHeight &&
      areBoundsVisible(screen, savedBounds)
    ) {
      return savedBounds;
    }

    const primaryWorkArea = screen.getPrimaryDisplay().workArea;
    const width = Math.min(defaultWidth, primaryWorkArea.width);
    const height = Math.min(defaultHeight, primaryWorkArea.height);
    const x = primaryWorkArea.x + Math.max(0, Math.round((primaryWorkArea.width - width) / 2));
    const y = primaryWorkArea.y + Math.max(0, Math.round((primaryWorkArea.height - height) / 2));

    return { x, y, width, height };
  }

  function persist(immediate = false) {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const saveState = () => {
      const currentWindow = getMainWindow();
      if (!currentWindow || currentWindow.isDestroyed()) return;

      configManager.setWindowMaximized(currentWindow.isMaximized());

      const bounds = currentWindow.isMaximized()
        ? currentWindow.getNormalBounds()
        : currentWindow.getBounds();

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

  function clearPending() {
    if (!saveWindowStateTimeout) return;
    clearTimeout(saveWindowStateTimeout);
    saveWindowStateTimeout = null;
  }

  return {
    clearPending,
    getValidatedWindowBounds,
    persist
  };
}

module.exports = {
  createMainWindowStateManager
};
