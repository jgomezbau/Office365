const { BrowserWindow } = require('electron');
const path = require('path');

// Función auxiliar para crear ventanas con configuración predeterminada
function createWindow(options = {}) {
  // Opciones por defecto
  const defaultOptions = {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, '..', '..', 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
      sandbox: true,
    },
    autoHideMenuBar: true,
    show: false, // No mostrar hasta estar listo
    backgroundColor: '#FFFFFF', // Fondo blanco por defecto
  };

  // Combinar opciones por defecto con las proporcionadas
  const windowOptions = {
    ...defaultOptions,
    ...options,
    webPreferences: {
      ...defaultOptions.webPreferences,
      ...(options.webPreferences || {}),
    },
  };

  // Crear la ventana
  const window = new BrowserWindow(windowOptions);

  // Configuración específica para macOS
  if (process.platform === 'darwin') {
    window.setTouchBar(null); // Deshabilitar TouchBar
  }

  return window;
}

module.exports = { createWindow };